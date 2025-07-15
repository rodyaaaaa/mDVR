import os
import time
import json
import threading
import subprocess
import RPi.GPIO as GPIO

from flask import Blueprint, jsonify, request

from dvr_web.constants import REED_SWITCH_AUTOSTOP_SECONDS, REED_SWITCH_PIN
from dvr_web.utils import check_reed_switch_status, read_reed_switch_state, emit_reed_switch_update, sync_reed_switch_state, load_config, get_config_path
import dvr_web.utils as utils


# Глобальні змінні для стеження за станом геркона
reed_switch_initialized = False
reed_switch_monitor_active = False
reed_switch_state = {"status": "unknown", "timestamp": 0}
reed_switch_autostop_time = None


reed_switch_bp = Blueprint('reed_switch', __name__)


def monitor_reed_switch():
    global reed_switch_state, reed_switch_monitor_active, reed_switch_initialized, reed_switch_autostop_time

    prev_state = None

    while reed_switch_monitor_active:
        try:
            current_time = time.time()

            if reed_switch_initialized and reed_switch_autostop_time and current_time >= reed_switch_autostop_time:
                GPIO.cleanup(REED_SWITCH_PIN)

                reed_switch_initialized = False
                reed_switch_autostop_time = None

                emit_reed_switch_update({
                    "status": "unknown",
                    "timestamp": int(current_time),
                    "initialized": False,
                    "autostop": True,
                    "seconds_left": 0
                })

                continue

            if not reed_switch_initialized:
                emit_reed_switch_update({
                    "status": "unknown",
                    "timestamp": int(current_time),
                    "initialized": False,
                    "autostop": False,
                    "seconds_left": 0
                })
                time.sleep(1)
                continue

            try:
                current_state = read_reed_switch_state()
            except:
                current_state = "unknown"

            if current_state != prev_state:
                time.sleep(0.05)
                try:
                    current_state = read_reed_switch_state()
                except:
                    current_state = "unknown"

                if current_state != prev_state:
                    timestamp = int(current_time)
                    reed_switch_state = {
                        "status": current_state,
                        "timestamp": timestamp
                    }

                    status_with_init = reed_switch_state.copy()
                    status_with_init["initialized"] = reed_switch_initialized

                    seconds_left = int(reed_switch_autostop_time - current_time) if reed_switch_autostop_time else 0
                    status_with_init["autostop"] = reed_switch_autostop_time is not None
                    status_with_init["seconds_left"] = max(0, seconds_left)

                    emit_reed_switch_update(status_with_init)
                    print(f"Зміна стану геркона: {current_state} в {timestamp}")

                    prev_state = current_state

            seconds_left = int(reed_switch_autostop_time - current_time) if reed_switch_autostop_time else 0
            update_interval = 1 if seconds_left <= 10 else 10

            if current_time - reed_switch_state.get("timestamp", 0) >= update_interval:
                status_with_init = reed_switch_state.copy()
                status_with_init["initialized"] = reed_switch_initialized
                status_with_init["autostop"] = reed_switch_autostop_time is not None
                status_with_init["seconds_left"] = max(0, seconds_left)

                emit_reed_switch_update(status_with_init)

            time.sleep(0.01)

        except Exception as e:
            print(str(e))
            time.sleep(5)


utils.monitor_reed_switch = monitor_reed_switch


@reed_switch_bp.route('/reed-switch-status')
def api_reed_switch_status():
    global reed_switch_state, reed_switch_initialized, reed_switch_autostop_time

    if not reed_switch_initialized:
        return jsonify({
            "status": "unknown",
            "timestamp": int(time.time()),
            "initialized": False,
            "autostop": False,
            "seconds_left": 0
        })

    try:
        current_status = read_reed_switch_state()
        current_time = int(time.time())

        reed_switch_state = {
            "status": current_status,
            "timestamp": current_time
        }
    except Exception as e:
        print(f"Помилка при оновленні стану геркона через API: {str(e)}")

    response = reed_switch_state.copy()
    response["initialized"] = reed_switch_initialized

    if reed_switch_autostop_time:
        seconds_left = max(0, int(reed_switch_autostop_time - time.time()))
        response["autostop"] = True
        response["seconds_left"] = seconds_left
    else:
        response["autostop"] = False
        response["seconds_left"] = 0

    return jsonify(response)


@reed_switch_bp.route('/initialize-reed-switch', methods=['POST'])
def api_initialize_reed_switch():
    global reed_switch_initialized, reed_switch_autostop_time, reed_switch_monitor_active

    rs_status = check_reed_switch_status()
    if rs_status:
        error_msg = "Помилка: Перемикач Reed Switch в налаштуваннях повинен бути у положенні OFF перед ініціалізацією геркона"
        print(f"[DEBUG API] {error_msg}")
        return jsonify({
            "success": False,
            "error": error_msg,
            "reed_switch_enabled": True
        })

    if reed_switch_initialized:
        GPIO.cleanup()

    try:
        reed_switch_state = {
            "status": "Unknown",
            "timestamp": int(time.time())
        }

        reed_switch_initialized = True

        reed_switch_autostop_time = time.time() + REED_SWITCH_AUTOSTOP_SECONDS

        if not reed_switch_monitor_active:
            reed_switch_monitor_active = True
            reed_switch_monitor_thread = threading.Thread(target=monitor_reed_switch)
            reed_switch_monitor_thread.daemon = True
            reed_switch_monitor_thread.start()

        sync_reed_switch_state(
            initialized=reed_switch_initialized,
            monitor_active=reed_switch_monitor_active,
            state=reed_switch_state,
            autostop_time=reed_switch_autostop_time
        )

        return jsonify({
            "success": True,
            "status": "Unknown",
            "autostop": True,
            "seconds_left": REED_SWITCH_AUTOSTOP_SECONDS
        })
    except Exception as e:
        error_msg = f"Помилка при ініціалізації геркона: {str(e)}"
        print(f"[DEBUG API] {error_msg}")
        return jsonify({
            "success": False,
            "error": error_msg,
            "autostop": False,
            "seconds_left": 0
        })


@reed_switch_bp.route('/stop-reed-switch', methods=['POST'])
def api_stop_reed_switch():
    global reed_switch_initialized, reed_switch_monitor_active, reed_switch_autostop_time

    reed_switch_monitor_active = False
    reed_switch_autostop_time = None
    reed_switch_initialized = False

    sync_reed_switch_state(
        initialized=reed_switch_initialized,
        monitor_active=reed_switch_monitor_active,
        autostop_time=reed_switch_autostop_time
    )
    GPIO.cleanup()
    return jsonify({"success": True, "message": "Моніторинг геркона зупинено"})


@reed_switch_bp.route('/get-reed-switch-status')
def get_reed_switch_status():
    try:
        output = subprocess.check_output(["systemctl", "is-enabled", "mdvr_rs.timer"]).decode().strip()
        state = "on" if output == "enabled" else "off"
        return jsonify({"state": state})
    except Exception as e:
        return jsonify({"state": "off", "error": str(e)})


@reed_switch_bp.route('/get-reed-switch-mode')
def get_reed_switch_mode():
    try:
        config = load_config()
        if "reed_switch" in config and "impulse" in config["reed_switch"]:
            impulse = config["reed_switch"]["impulse"]
        else:
            impulse = 0  # Default to mechanical (0) if not found
        return jsonify({"impulse": impulse})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@reed_switch_bp.route('/toggle-reed-switch', methods=['POST'])
def toggle_reed_switch():
    data = request.get_json()
    state = data.get("reed_switch", "off")
    try:
        if state == "on":
            os.system("systemctl stop mdvr.service")
            os.system("systemctl disable mdvr.timer")
            os.system("systemctl stop mdvr.timer")
            os.system("systemctl enable mdvr_rs.timer")
            os.system("systemctl start mdvr_rs.timer")
        else:
            os.system("systemctl stop mdvr_rs.service")
            os.system("systemctl disable mdvr_rs.timer")
            os.system("systemctl stop mdvr_rs.timer")
            os.system("systemctl enable mdvr.timer")
            os.system("systemctl start mdvr.timer")
        return jsonify({"success": True, "message": "Reed Switch toggled successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@reed_switch_bp.route('/get-rs-timeout')
def get_rs_timeout():
    try:
        config = load_config()
        return jsonify({"timeout": config["reed_switch"]["rs_timeout"]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@reed_switch_bp.route('/toggle-reed-switch-mode', methods=['POST'])
def toggle_reed_switch_mode():
    try:
        data = request.json
        impulse = data.get('impulse', 0)

        config = load_config()

        # Ensure reed_switch section exists
        if "reed_switch" not in config:
            config["reed_switch"] = {}

        # Update impulse value
        config["reed_switch"]["impulse"] = impulse

        # Save updated config
        with open(get_config_path(), 'w') as file:
            json.dump(config, file, indent=4)

        # If the reed switch service is running, restart it to apply changes
        if check_reed_switch_status():
            os.system("systemctl restart mdvr_rs")

        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
