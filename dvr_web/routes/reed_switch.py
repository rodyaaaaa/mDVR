import os
import time
import threading
import RPi.GPIO as GPIO  # Add RPi.GPIO import

from flask import Blueprint, jsonify, request

from dvr_web.constants import REED_SWITCH_AUTOSTOP_SECONDS, REED_SWITCH_PIN
from dvr_web.utils import check_reed_switch_status, initialize_reed_switch, read_reed_switch_state, emit_reed_switch_update
import dvr_web.utils as utils  # Import utils module to set monitor_reed_switch function


# Глобальні змінні для стеження за станом геркона
reed_switch_initialized = False
reed_switch_monitor_active = False
reed_switch_state = {"status": "unknown", "timestamp": 0}
reed_switch_autostop_time = None


# Змінюємо назву blueprint для коректного перенаправлення
reed_switch_bp = Blueprint('reed_switch', __name__)


# Функція для моніторингу стану геркона
def monitor_reed_switch():
    global reed_switch_state, reed_switch_monitor_active, reed_switch_initialized, reed_switch_autostop_time
    
    # Змінні для відстеження попереднього стану
    prev_state = None
    
    while reed_switch_monitor_active:
        try:
            current_time = time.time()
            
            # Перевіряємо, чи настав час автоматичної зупинки
            if reed_switch_initialized and reed_switch_autostop_time and current_time >= reed_switch_autostop_time:
                print("Автоматична зупинка моніторингу після заданого часу")
                
                # Звільняємо GPIO
                try:
                    GPIO.cleanup(REED_SWITCH_PIN)
                    print(f"Ресурси GPIO {REED_SWITCH_PIN} звільнені")
                except Exception as e:
                    print(f"Помилка при звільненні GPIO: {str(e)}")
                
                reed_switch_initialized = False
                reed_switch_autostop_time = None
                
                # Відправляємо повідомлення про зупинку всім клієнтам
                emit_reed_switch_update({
                    "status": "unknown",
                    "timestamp": int(current_time),
                    "initialized": False,
                    "autostop": True,
                    "seconds_left": 0
                })
                
                continue
            
            # Перевіряємо, чи геркон ініціалізовано
            if not reed_switch_initialized:
                # Відправляємо статус "не ініціалізовано"
                emit_reed_switch_update({
                    "status": "unknown",
                    "timestamp": int(current_time),
                    "initialized": False,
                    "autostop": False,
                    "seconds_left": 0
                })
                time.sleep(1)
                continue
            
            # Читаємо поточний стан геркона
            try:
                current_state = read_reed_switch_state()
            except:
                current_state = "unknown"
            
            # Перевіряємо, чи стан змінився
            if current_state != prev_state:
                # Фільтрація дребезгу контактів
                time.sleep(0.05)
                try:
                    current_state = read_reed_switch_state()
                except:
                    current_state = "unknown"
                
                # Якщо стан все ще відрізняється від попереднього
                if current_state != prev_state:
                    timestamp = int(current_time)
                    reed_switch_state = {
                        "status": current_state,
                        "timestamp": timestamp
                    }
                    
                    # Додаємо статус ініціалізації та час до зупинки
                    status_with_init = reed_switch_state.copy()
                    status_with_init["initialized"] = reed_switch_initialized
                    
                    seconds_left = int(reed_switch_autostop_time - current_time) if reed_switch_autostop_time else 0
                    status_with_init["autostop"] = reed_switch_autostop_time is not None
                    status_with_init["seconds_left"] = max(0, seconds_left)
                    
                    # Відправляємо оновлення через WebSocket
                    emit_reed_switch_update(status_with_init)
                    print(f"Зміна стану геркона: {current_state} в {timestamp}")
                    
                    prev_state = current_state
            
            # Періодичне оновлення для таймеру зворотнього відліку
            seconds_left = int(reed_switch_autostop_time - current_time) if reed_switch_autostop_time else 0
            update_interval = 1 if seconds_left <= 10 else 10  # Частіше оновлюємо в останні 10 секунд
            
            if current_time - reed_switch_state.get("timestamp", 0) >= update_interval:
                # Додаємо статус ініціалізації та час до зупинки
                status_with_init = reed_switch_state.copy()
                status_with_init["initialized"] = reed_switch_initialized
                status_with_init["autostop"] = reed_switch_autostop_time is not None
                status_with_init["seconds_left"] = max(0, seconds_left)
                
                # Відправляємо оновлення таймера через WebSocket
                emit_reed_switch_update(status_with_init)
            
            time.sleep(0.01)  # Невелика пауза для економії CPU
            
        except Exception as e:
            print(f"Помилка в моніторингу геркона: {str(e)}")
            time.sleep(5)

# Set the monitor_reed_switch function in utils module
utils.monitor_reed_switch = monitor_reed_switch


# REST API для отримання поточного стану геркона
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


# Новий API маршрут для ініціалізації геркона
@reed_switch_bp.route('/initialize-reed-switch', methods=['POST'])
def api_initialize_reed_switch():
    global reed_switch_initialized, reed_switch_autostop_time, reed_switch_monitor_active
    
    rs_status = check_reed_switch_status()
    if rs_status:
        error_msg = "Помилка: Перемикач Reed Switch в налаштуваннях повинен бути у положенні OFF перед ініціалізацією геркона"
        print(error_msg)
        return jsonify({
            "success": False, 
            "error": error_msg,
            "reed_switch_enabled": True
        })
    
    if reed_switch_initialized:
        try:
            # Звільняємо GPIO
            GPIO.cleanup(REED_SWITCH_PIN)
        except Exception as e:
            print(f"Помилка при звільненні GPIO: {str(e)}")
    
    reed_switch_autostop_time = None
    
    result = initialize_reed_switch()
    
    if result["success"]:
        # Встановлюємо глобальні змінні стану
        reed_switch_initialized = True
        reed_switch_autostop_time = time.time() + REED_SWITCH_AUTOSTOP_SECONDS
        
        # Запускаємо потік моніторингу, якщо він ще не запущений
        if not reed_switch_monitor_active:
            reed_switch_monitor_active = True
            reed_switch_monitor_thread = threading.Thread(target=monitor_reed_switch)
            reed_switch_monitor_thread.daemon = True
            reed_switch_monitor_thread.start()
        
        # Оновлюємо результат
        result["autostop"] = True
        result["seconds_left"] = REED_SWITCH_AUTOSTOP_SECONDS
    else:
        result["autostop"] = False
        result["seconds_left"] = 0
    
    return jsonify(result)


# Новий API маршрут для зупинки моніторингу геркона
@reed_switch_bp.route('/stop-reed-switch', methods=['POST'])
def api_stop_reed_switch():
    global reed_switch_initialized, reed_switch_monitor_active, reed_switch_autostop_time
    
    try:
        reed_switch_monitor_active = False
        
        reed_switch_autostop_time = None
        
        if reed_switch_initialized:
            try:
                GPIO.cleanup(REED_SWITCH_PIN)
            except Exception as e:
                print(f"Помилка при звільненні GPIO: {str(e)}")
                
            reed_switch_initialized = False
        
        return jsonify({"success": True, "message": "Моніторинг геркона зупинено"})
    except Exception as e:
        error_msg = f"Помилка при зупинці моніторингу геркона: {str(e)}"
        print(error_msg)
        return jsonify({"success": False, "error": error_msg})


@reed_switch_bp.route('/get-reed-switch-status')
def get_reed_switch_status():
    try:
        output = os.popen("systemctl is-enabled mdvr_rs.timer").read().strip()
        state = "on" if output == "enabled" else "off"
        return jsonify({"state": state})
    except Exception as e:
        return jsonify({"state": "off", "error": str(e)})


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
        