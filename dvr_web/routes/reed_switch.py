import os
import time
import json
import subprocess

from flask import Blueprint, jsonify, request

from dvr_web.constants import REED_SWITCH_AUTOSTOP_SECONDS
from dvr_web.utils import check_reed_switch_status, load_config, get_config_path
from dvr_web.reed_switch_interface import RSFactory


# Глобальні змінні для стеження за станом геркона
reed_switch_initialized = False
reed_switch_state = {"status": "unknown", "timestamp": 0}
reed_switch_autostop_time = None
reed_switch_object = None

reed_switch_bp = Blueprint('reed_switch', __name__)


@reed_switch_bp.route('/reed-switch-status')
def api_reed_switch_status():
    global reed_switch_state

    reed_switch_state = { "status": read_reed_switch_state() }

    return jsonify(reed_switch_state)


@reed_switch_bp.route('/initialize-reed-switch', methods=['POST'])
def api_initialize_reed_switch():
    global reed_switch_initialized, reed_switch_autostop_time, reed_switch_object

    config = load_config()
    impulse=config["reed_switch"]["impulse"]
    rs_status = check_reed_switch_status()
    if rs_status:
        error_msg = "Error: The Reed Switch in the settings must be in the OFF position before initializing the reed sensor."
        return jsonify({
            "success": False,
            "error": error_msg,
            "reed_switch_enabled": True
        })

    reed_switch_object = RSFactory.create(bool(impulse))
    reed_switch_object.setup()
    reed_switch_initialized = True
    reed_switch_autostop_time = time.time() + REED_SWITCH_AUTOSTOP_SECONDS

    return jsonify({
        "success": True,
        "autostop": True,
        "seconds_left": REED_SWITCH_AUTOSTOP_SECONDS
    })


@reed_switch_bp.route('/stop-reed-switch', methods=['POST'])
def api_stop_reed_switch():
    global reed_switch_initialized, reed_switch_autostop_time, reed_switch_object

    reed_switch_autostop_time = None
    reed_switch_initialized = False
    print(reed_switch_object)
    reed_switch_object.clean()
    print(reed_switch_object)

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
            impulse = 0
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

        if "reed_switch" not in config:
            config["reed_switch"] = {}

        config["reed_switch"]["impulse"] = impulse

        with open(get_config_path(), 'w') as file:
            json.dump(config, file, indent=4)

        if check_reed_switch_status():
            os.system("systemctl restart mdvr_rs")

        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# Функція для читання стану геркона через єдиний інтерфейс
def read_reed_switch_state():
    global reed_switch_object

    pressed = reed_switch_object.pressed()

    if pressed is True:
        return "opened"
    elif pressed is False:
        return "closed"
    else:
        return "unknown"
