import psutil
import subprocess
import time
import os
import threading
import RPi.GPIO as GPIO

from flask import Blueprint, jsonify, request
from dvr_web.utils import (
    load_config, sync_reed_switch_state, read_reed_switch_state, 
    emit_reed_switch_update, check_reed_switch_status
)
from dvr_web.constants import REED_SWITCH_PIN, REED_SWITCH_AUTOSTOP_SECONDS

api_bp = Blueprint('api', __name__)

# Оголошуємо глобальні змінні для стеження за станом геркона
reed_switch_initialized = False
reed_switch_monitor_active = False
reed_switch_state = {"status": "unknown", "timestamp": 0}
reed_switch_autostop_time = None

cpu_load_history = []


# Функція для моніторингу стану геркона
def monitor_reed_switch():
    global reed_switch_state, reed_switch_monitor_active, reed_switch_initialized, reed_switch_autostop_time
    
    # Змінні для відстеження попереднього стану
    prev_state = None
    last_update_time = 0
    debounce_count = 0  # Лічильник однакових послідовних зчитувань для фільтрації
    
    while reed_switch_monitor_active:
        try:
            current_time = time.time()
            
            # Перевіряємо, чи настав час автоматичної зупинки
            if reed_switch_initialized and reed_switch_autostop_time and current_time >= reed_switch_autostop_time:
                print("[DEBUG MONITOR] Автоматична зупинка моніторингу після заданого часу")
                
                # Звільняємо GPIO
                try:
                    GPIO.cleanup(REED_SWITCH_PIN)
                    print(f"[DEBUG MONITOR] Ресурси GPIO {REED_SWITCH_PIN} звільнені")
                except Exception as e:
                    print(f"[DEBUG MONITOR] Помилка при звільненні GPIO: {str(e)}")
                
                # Синхронізуємо стан між модулями
                sync_reed_switch_state(
                    initialized=False,
                    autostop_time=None
                )
                
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
            
            state_changed = False
            
            # Перевіряємо, чи стан змінився
            if current_state != prev_state:
                # Для стану "opened" потрібно більше послідовних зчитувань для підтвердження
                if current_state == "opened":
                    debounce_count += 1
                    if debounce_count < 3:  # Потрібно 3 послідовних зчитування
                        time.sleep(0.05)
                        continue
                
                # Фільтрація дребезгу контактів
                time.sleep(0.05)
                try:
                    confirm_state = read_reed_switch_state()
                except:
                    confirm_state = "unknown"
                
                # Якщо стан все ще відрізняється від попереднього і підтверджений повторним зчитуванням
                if current_state == confirm_state and current_state != prev_state:
                    debounce_count = 0  # Скидаємо лічильник
                    state_changed = True
                    timestamp = int(current_time)
                    state = {
                        "status": current_state,
                        "timestamp": timestamp
                    }
                    
                    # Синхронізуємо стан між модулями
                    sync_reed_switch_state(state=state)
                    
                    # Додаємо статус ініціалізації та час до зупинки
                    status_with_init = state.copy()
                    status_with_init["initialized"] = reed_switch_initialized
                    
                    seconds_left = int(reed_switch_autostop_time - current_time) if reed_switch_autostop_time else 0
                    status_with_init["autostop"] = reed_switch_autostop_time is not None
                    status_with_init["seconds_left"] = max(0, seconds_left)
                    
                    # Відправляємо оновлення через WebSocket
                    emit_reed_switch_update(status_with_init)
                    print(f"[DEBUG MONITOR] Зміна стану геркона: {current_state} в {timestamp}")
                    
                    prev_state = current_state
                    last_update_time = current_time
            else:
                debounce_count = 0  # Скидаємо лічильник, якщо стан не змінюється
            
            # Періодичне оновлення для таймеру зворотнього відліку та стану геркона
            # навіть якщо стан не змінився
            seconds_left = int(reed_switch_autostop_time - current_time) if reed_switch_autostop_time else 0
            update_interval = 0.5 if seconds_left <= 10 else 1  # Частіше оновлюємо в останні 10 секунд
            
            # Надсилаємо оновлення, якщо пройшов певний інтервал часу з моменту останнього оновлення
            # або якщо стан змінився
            if (current_time - last_update_time >= update_interval) or state_changed:
                # Створюємо статус для відправки
                status_with_init = reed_switch_state.copy()
                status_with_init["initialized"] = reed_switch_initialized
                status_with_init["autostop"] = reed_switch_autostop_time is not None
                status_with_init["seconds_left"] = max(0, seconds_left)
                
                # Відправляємо оновлення через WebSocket
                emit_reed_switch_update(status_with_init)
                
                # Виводимо у консоль інформацію про тип оновлення
                if state_changed:
                    print(f"[DEBUG MONITOR] Відправлено оновлення зі зміною стану: {current_state}")
                else:
                    print(f"[DEBUG MONITOR] Відправлено періодичне оновлення. Секунд залишилось: {seconds_left}")
                
                last_update_time = current_time
            
            time.sleep(0.01)  # Невелика пауза для економії CPU
            
        except Exception as e:
            print(f"[DEBUG MONITOR] Помилка в моніторингу геркона: {str(e)}")
            time.sleep(5)


@api_bp.route('/ext5v-v')
def api_ext5v_v():
    try:
        result = subprocess.run(['vcgencmd', 'pmic_read_adc'], capture_output=True, text=True, check=True)
        for line in result.stdout.splitlines():
            if 'EXT5V_V' in line:
                return jsonify({'value': line.strip()})
        return jsonify({'value': None})
    except Exception as e:
        return jsonify({'value': f'Error: {e}'})
    

@api_bp.route('/get-imei')
def get_imei():
    try:
        config = load_config()
        return jsonify({"imei": config['program_options']['imei']})
    except Exception as e:
        return jsonify({"imei": "", "error": str(e)})


@api_bp.route('/reed-switch-status')
def api_reed_switch_status():
    global reed_switch_state, reed_switch_initialized, reed_switch_autostop_time
    
    print(f"[DEBUG API] /reed-switch-status – reed_switch_initialized = {reed_switch_initialized}")
    
    try:
        current_time = int(time.time())
        
        if not reed_switch_initialized:
            print("[DEBUG API] Геркон не ініціалізовано, повертаємо unknown статус")
            return jsonify({
                "status": "unknown",
                "timestamp": current_time,
                "initialized": False,
                "autostop": False,
                "seconds_left": 0
            })
        
        # Зчитуємо поточний стан
        current_status = read_reed_switch_state()
        
        # Валідуємо та коректуємо значення стану
        if current_status not in ["closed", "opened", "unknown"]:
            if current_status == "open":
                current_status = "opened"
            else:
                current_status = "unknown"
                
        state = {
            "status": current_status,
            "timestamp": current_time
        }
        
        # Синхронізуємо стан між модулями
        sync_reed_switch_state(state=state)
        
        print(f"[DEBUG API] Зчитано статус геркона: {current_status}")
        
        # Готуємо відповідь
        response = {
            "status": current_status,
            "timestamp": current_time,
            "initialized": reed_switch_initialized,
            "autostop": reed_switch_autostop_time is not None,
            "seconds_left": max(0, int(reed_switch_autostop_time - current_time)) if reed_switch_autostop_time else 0
        }
        
        print(f"[DEBUG API] Відправляємо відповідь: {response}")
        return jsonify(response)
        
    except Exception as e:
        print(f"[DEBUG API] Помилка при зчитуванні стану геркона: {str(e)}")
        return jsonify({
            "status": "unknown",
            "timestamp": int(time.time()),
            "initialized": reed_switch_initialized,
            "autostop": False,
            "seconds_left": 0,
            "error": str(e)
        })


@api_bp.route('/initialize-reed-switch', methods=['POST'])
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
        try:
            # Звільняємо GPIO
            GPIO.cleanup(REED_SWITCH_PIN)
        except Exception as e:
            print(f"[DEBUG API] Помилка при звільненні GPIO: {str(e)}")
    
    try:
        print(f"[DEBUG API] Початок ініціалізації геркона на піні {REED_SWITCH_PIN}")
        
        # Налаштування GPIO з використанням RPi.GPIO
        GPIO.setup(REED_SWITCH_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        
        # Ініціалізуємо початковий стан геркона
        gpio_value = GPIO.input(REED_SWITCH_PIN)
        initial_status = "open" if gpio_value == GPIO.HIGH else "closed"
        
        print(f"[DEBUG API] Успішно налаштовано GPIO. Зчитане значення: {gpio_value}, статус: {initial_status}")
        
        # Оновлюємо глобальні змінні
        reed_switch_state = {
            "status": initial_status,
            "timestamp": int(time.time())
        }
        
        reed_switch_initialized = True
        
        # Встановлюємо час автоматичної зупинки через вказаний час
        reed_switch_autostop_time = time.time() + REED_SWITCH_AUTOSTOP_SECONDS
        
        # Запускаємо потік моніторингу, якщо він ще не запущений
        if not reed_switch_monitor_active:
            reed_switch_monitor_active = True
            reed_switch_monitor_thread = threading.Thread(target=monitor_reed_switch)
            reed_switch_monitor_thread.daemon = True
            reed_switch_monitor_thread.start()
            print(f"[DEBUG API] Запущено потік моніторингу геркона")
        
        # Синхронізуємо стан між модулями
        sync_reed_switch_state(
            initialized=reed_switch_initialized,
            monitor_active=reed_switch_monitor_active,
            state=reed_switch_state,
            autostop_time=reed_switch_autostop_time
        )
        
        print(f"[DEBUG API] GPIO налаштовано для геркона на піні {REED_SWITCH_PIN}")
        print(f"[DEBUG API] Початковий стан геркона: {initial_status}")
        print(f"[DEBUG API] Встановлено автоматичну зупинку через {REED_SWITCH_AUTOSTOP_SECONDS} секунд")
        
        # Повертаємо успішний результат
        return jsonify({
            "success": True,
            "status": initial_status,
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


@api_bp.route('/stop-reed-switch', methods=['POST'])
def api_stop_reed_switch():
    global reed_switch_initialized, reed_switch_monitor_active, reed_switch_autostop_time
    
    try:
        reed_switch_monitor_active = False
        
        reed_switch_autostop_time = None
        
        if reed_switch_initialized:
            try:
                GPIO.cleanup(REED_SWITCH_PIN)
            except Exception as e:
                print(f"[DEBUG API] Помилка при звільненні GPIO: {str(e)}")
                
            reed_switch_initialized = False
        
        # Синхронізуємо стан між модулями
        sync_reed_switch_state(
            initialized=reed_switch_initialized,
            monitor_active=reed_switch_monitor_active,
            autostop_time=reed_switch_autostop_time
        )
        
        return jsonify({"success": True, "message": "Моніторинг геркона зупинено"})
    except Exception as e:
        error_msg = f"Помилка при зупинці моніторингу геркона: {str(e)}"
        print(f"[DEBUG API] {error_msg}")
        return jsonify({"success": False, "error": error_msg})


@api_bp.route('/get-reed-switch-status')
def get_reed_switch_status():
    try:
        output = subprocess.check_output(["systemctl", "is-enabled", "mdvr_rs.timer"]).decode().strip()
        state = "on" if output == "enabled" else "off"
        return jsonify({"state": state})
    except Exception as e:
        return jsonify({"state": "off", "error": str(e)})


@api_bp.route('/toggle-reed-switch', methods=['POST'])
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


@api_bp.route('/cpu-load')
def api_cpu_load():
    if not psutil:
        return jsonify({'error': 'psutil not installed'}), 500
    return jsonify({'history': cpu_load_history[-60:]})


@api_bp.route('/mem-usage')
def api_mem_usage():
    if not psutil:
        return jsonify({'error': 'psutil not installed'}), 500
    mem = psutil.virtual_memory()
    return jsonify({
        'total': mem.total,
        'used': mem.used,
        'free': mem.available,
        'percent': mem.percent
    })


@api_bp.route('/disk-usage')
def api_disk_usage():
    if not psutil:
        return jsonify({'error': 'psutil not installed'}), 500
    disk = psutil.disk_usage('/')
    return jsonify({
        'total': disk.total,
        'used': disk.used,
        'free': disk.free,
        'percent': disk.percent
    })


@api_bp.route('/sync-reed-switch', methods=['POST'])
def api_sync_reed_switch():
    """
    Ендпоінт для примусової синхронізації стану геркона
    та відправки оновлення через WebSocket.
    """
    global reed_switch_state, reed_switch_initialized, reed_switch_autostop_time
    
    print("[DEBUG API] Виконується примусова синхронізація стану геркона")
    
    try:
        # Отримуємо поточний стан, якщо геркон ініціалізовано
        if reed_switch_initialized:
            current_state = read_reed_switch_state()
            current_time = int(time.time())
            
            # Створюємо новий стан
            state = {
                "status": current_state,
                "timestamp": current_time
            }
            
            # Синхронізуємо між модулями
            sync_reed_switch_state(state=state)
        else:
            current_time = int(time.time())
            # Використовуємо існуючий стан "unknown"
            reed_switch_state = {
                "status": "unknown",
                "timestamp": current_time
            }
        
        # Підготовка даних для відправки
        status_data = reed_switch_state.copy()
        status_data["initialized"] = reed_switch_initialized
        status_data["autostop"] = reed_switch_autostop_time is not None
        
        # Додаємо час до автоматичної зупинки
        seconds_left = int(reed_switch_autostop_time - time.time()) if reed_switch_autostop_time else 0
        status_data["seconds_left"] = max(0, seconds_left)
        
        # Відправляємо оновлення через WebSocket
        emit_reed_switch_update(status_data)
        
        print(f"[DEBUG API] Примусово відправлено оновлення через WebSocket: {status_data}")
        
        # Повертаємо успіх і поточний стан
        return jsonify({
            "success": True,
            "state": status_data
        })
        
    except Exception as e:
        error_msg = f"Помилка при примусовій синхронізації: {str(e)}"
        print(f"[DEBUG API] {error_msg}")
        return jsonify({
            "success": False,
            "error": error_msg
        })
