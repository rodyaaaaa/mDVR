import psutil
import subprocess
import time
import os
import threading
import RPi.GPIO as GPIO
import json

from flask import Blueprint, jsonify, request, send_from_directory
from dvr_web.utils import (
    load_config, sync_reed_switch_state, read_reed_switch_state, 
    emit_reed_switch_update, check_reed_switch_status, get_config_path
)
from dvr_web.constants import REED_SWITCH_PIN, REED_SWITCH_AUTOSTOP_SECONDS

api_bp = Blueprint('api', __name__)

# Оголошуємо глобальні змінні для стеження за станом геркона
reed_switch_initialized = False
reed_switch_monitor_active = False
reed_switch_state = {"status": "unknown", "timestamp": 0}
reed_switch_autostop_time = None

cpu_load_history = []
cpu_monitor_active = False

# Функція для моніторингу CPU навантаження
def monitor_cpu_load():
    global cpu_load_history, cpu_monitor_active
    
    while cpu_monitor_active:
        try:
            # Отримуємо поточне навантаження CPU
            cpu_percent = psutil.cpu_percent(interval=1)
            
            # Додаємо значення до історії
            cpu_load_history.append(cpu_percent)
            
            # Обмежуємо розмір історії до 60 значень
            if len(cpu_load_history) > 60:
                cpu_load_history = cpu_load_history[-60:]
                
            # Пауза між вимірами
            time.sleep(1)
        except Exception as e:
            print(f"[DEBUG CPU] Помилка в моніторингу CPU: {str(e)}")
            time.sleep(5)

# Запускаємо потік моніторингу CPU
def start_cpu_monitoring():
    global cpu_monitor_active
    
    if not cpu_monitor_active:
        cpu_monitor_active = True
        cpu_monitor_thread = threading.Thread(target=monitor_cpu_load)
        cpu_monitor_thread.daemon = True
        cpu_monitor_thread.start()
        print("[DEBUG CPU] Запущено потік моніторингу CPU")

# Запускаємо моніторинг CPU при імпорті модуля
start_cpu_monitoring()

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
                debounce_count = 0
            
            # Періодичне оновлення для таймеру зворотнього відліку та стану геркона
            # навіть якщо стан не змінився
            seconds_left = int(reed_switch_autostop_time - current_time) if reed_switch_autostop_time else 0
            update_interval = 0.5 if seconds_left <= 10 else 1
            
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
                # Extract just the value part from the line (assuming format like "EXT5V_V: 4.97V")
                value_part = line.strip().split(': ')
                if len(value_part) > 1:
                    return jsonify({'value': value_part[1]})
                else:
                    return jsonify({'value': line.strip()})
        return jsonify({'value': 'N/A'})
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
    
    # Якщо історія порожня, додаємо поточне значення
    if not cpu_load_history:
        cpu_percent = psutil.cpu_percent(interval=0.1)
        cpu_load_history.append(cpu_percent)
    
    # Get additional CPU information
    cpu_freq = psutil.cpu_freq()
    cpu_count = psutil.cpu_count(logical=True)
    physical_cores = psutil.cpu_count(logical=False)
    per_cpu_percent = psutil.cpu_percent(interval=0.1, percpu=True)
    
    return jsonify({
        'history': cpu_load_history[-60:],
        'current': cpu_load_history[-1] if cpu_load_history else 0,
        'cores': {
            'logical': cpu_count,
            'physical': physical_cores
        },
        'frequency': {
            'current': cpu_freq.current if cpu_freq else None,
            'min': cpu_freq.min if cpu_freq and hasattr(cpu_freq, 'min') else None,
            'max': cpu_freq.max if cpu_freq and hasattr(cpu_freq, 'max') else None
        },
        'per_core': per_cpu_percent
    })


@api_bp.route('/mem-usage')
def api_mem_usage():
    if not psutil:
        return jsonify({'error': 'psutil not installed'}), 500
    
    # Get detailed memory information
    mem = psutil.virtual_memory()
    
    # Get swap information
    swap = psutil.swap_memory()
    
    return jsonify({
        'memory': {
            'total': mem.total,
            'used': mem.used,
            'free': mem.available,
            'percent': mem.percent,
            'cached': mem.cached if hasattr(mem, 'cached') else None,
            'buffers': mem.buffers if hasattr(mem, 'buffers') else None
        },
        'swap': {
            'total': swap.total,
            'used': swap.used,
            'free': swap.free,
            'percent': swap.percent
        }
    })


@api_bp.route('/disk-usage')
def api_disk_usage():
    if not psutil:
        return jsonify({'error': 'psutil not installed'}), 500
    
    # Get basic disk usage
    disk = psutil.disk_usage('/')
    
    # Get disk I/O information
    try:
        disk_io = psutil.disk_io_counters()
        read_speed = disk_io.read_bytes
        write_speed = disk_io.write_bytes
    except:
        read_speed = None
        write_speed = None
    
    # Get disk partitions
    partitions = []
    for part in psutil.disk_partitions(all=False):
        if part.mountpoint == '/':
            try:
                usage = psutil.disk_usage(part.mountpoint)
                partitions.append({
                    'device': part.device,
                    'mountpoint': part.mountpoint,
                    'fstype': part.fstype,
                    'total': usage.total,
                    'used': usage.used,
                    'free': usage.free,
                    'percent': usage.percent
                })
            except:
                pass
    
    return jsonify({
        'total': disk.total,
        'used': disk.used,
        'free': disk.free,
        'percent': disk.percent,
        'io': {
            'read_bytes': read_speed,
            'write_bytes': write_speed
        },
        'partitions': partitions
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


@api_bp.route('/system-temperature')
def api_system_temperature():
    try:
        # Get CPU temperature
        with open('/sys/class/thermal/thermal_zone0/temp', 'r') as f:
            cpu_temp = round(float(f.read().strip()) / 1000, 1)
        
        # Get GPU temperature using vcgencmd
        gpu_temp_output = subprocess.check_output(['vcgencmd', 'measure_temp']).decode('utf-8')
        gpu_temp = float(gpu_temp_output.replace('temp=', '').replace('\'C', ''))
        
        # Get system temperature - for now using the CPU temp as base
        system_temp = cpu_temp  # Simplified, could be calculated as average of multiple sensors
        
        return jsonify({
            "cpu_temp": f"{cpu_temp}°C",
            "gpu_temp": f"{gpu_temp}°C",
            "system_temp": f"{system_temp}°C",
            "timestamp": int(time.time())
        })
    except Exception as e:
        return jsonify({
            "error": str(e),
            "cpu_temp": "N/A",
            "gpu_temp": "N/A",
            "system_temp": "N/A",
            "timestamp": int(time.time())
        })


@api_bp.route('/check-rtsp-connection', methods=['POST'])
def check_rtsp_connection():
    data = request.get_json()
    rtsp_url = data.get('rtsp_url', '')
    
    if not rtsp_url:
        return jsonify({
            'success': False,
            'message': 'RTSP URL is required',
            'details': ''
        })
    
    try:
        # Execute ffprobe to check the connection
        command = [
            'ffprobe', 
            '-v', 'error',
            '-show_entries', 'stream=codec_type,width,height',
            '-of', 'default',  # Changed from json to default to avoid JSON parsing issues
            '-analyzeduration', '3000000',  # 3 seconds analysis
            '-timeout', '5000000',  # 5 seconds timeout
            rtsp_url
        ]
        
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        stdout, stderr = process.communicate(timeout=10)  # 10 seconds overall timeout
        
        if process.returncode == 0:
            # Process successful output
            return jsonify({
                'success': True,
                'message': 'Connection successful',
                'details': stdout or "Connection established successfully, but no stream details returned."
            })
        else:
            # Process error output
            error_details = stderr
            if not error_details:
                error_details = "Unknown error occurred"
            
            return jsonify({
                'success': False,
                'message': 'Connection failed',
                'details': error_details
            })
            
    except subprocess.TimeoutExpired:
        return jsonify({
            'success': False,
            'message': 'Connection timed out',
            'details': 'The operation timed out after 10 seconds'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error: {str(e)}',
            'details': str(e)
        })

@api_bp.route('/start-rtsp-stream', methods=['POST'])
def start_rtsp_stream():
    """Start an RTSP stream and make it available via HLS for web viewing"""
    data = request.get_json()
    rtsp_url = data.get('rtsp_url', '')
    
    if not rtsp_url:
        return jsonify({
            'success': False,
            'message': 'RTSP URL is required'
        })
    
    try:
        # Create a unique stream ID based on the RTSP URL
        import hashlib
        stream_id = hashlib.md5(rtsp_url.encode()).hexdigest()[:8]
        
        # Create directories for HLS stream if they don't exist
        stream_dir = f"/tmp/mdvr_streams/{stream_id}"
        os.makedirs(stream_dir, exist_ok=True)
        
        # Check if ffmpeg is already running for this stream
        try:
            # Check if a process with this stream ID is running
            ps_output = subprocess.check_output(
                f"ps aux | grep 'ffmpeg.*{stream_id}' | grep -v grep", 
                shell=True
            ).decode()
            
            # If we got here, the process is running
            stream_url = f"/api/stream/{stream_id}/playlist.m3u8"
            return jsonify({
                'success': True,
                'message': 'Stream is already running',
                'stream_url': stream_url
            })
        except subprocess.CalledProcessError:
            # No existing process, continue with starting a new one
            pass
        
        # Kill any existing ffmpeg processes for this stream (cleanup)
        try:
            subprocess.call(f"pkill -f 'ffmpeg.*{stream_id}'", shell=True)
        except:
            pass
        
        # Start ffmpeg process to convert RTSP to HLS
        ffmpeg_cmd = [
            'ffmpeg',
            '-i', rtsp_url,
            '-c:v', 'copy',         # Copy video codec
            '-c:a', 'aac',          # Convert audio to AAC
            '-f', 'hls',            # HLS format
            '-hls_time', '2',       # 2-second segments
            '-hls_list_size', '3',  # Keep 3 segments in the playlist
            '-hls_flags', 'delete_segments+append_list',  # Delete old segments and append to playlist
            '-hls_allow_cache', '0',  # Disable caching
            '-hls_segment_type', 'mpegts',  # Use MPEG-TS segments
            '-method', 'PUT',       # Use PUT method for HTTP
            '-hls_segment_filename', f"{stream_dir}/segment_%03d.ts",
            f"{stream_dir}/playlist.m3u8"
        ]
        
        # Print the command for debugging
        print(f"Starting ffmpeg with command: {' '.join(ffmpeg_cmd)}")
        
        # Run the process in the background
        process = subprocess.Popen(
            ffmpeg_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        # Wait a moment to ensure ffmpeg has started
        time.sleep(2)
        
        # Check if the process is still running and the playlist file exists
        if process.poll() is not None:
            # Process has already terminated, get error output
            _, stderr = process.communicate()
            error_msg = stderr.decode()
            return jsonify({
                'success': False,
                'message': 'Failed to start stream',
                'details': error_msg
            })
        
        # Check if the playlist file was created
        if not os.path.exists(f"{stream_dir}/playlist.m3u8"):
            return jsonify({
                'success': False,
                'message': 'Stream started but playlist file was not created',
                'details': 'Try again or check server logs'
            })
        
        # Return the URL for the HLS stream with absolute path
        host = request.host_url.rstrip('/')
        stream_url = f"{host}/api/stream/{stream_id}/playlist.m3u8"
        
        return jsonify({
            'success': True,
            'message': 'Stream started successfully',
            'stream_url': stream_url
        })
        
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error starting stream: {error_details}")
        return jsonify({
            'success': False,
            'message': f'Error: {str(e)}',
            'details': error_details
        })

@api_bp.route('/stream/<stream_id>/<path:filename>')
def serve_stream_file(stream_id, filename):
    """Serve HLS stream files"""
    try:
        directory = f"/tmp/mdvr_streams/{stream_id}"
        
        # Add CORS headers to allow the stream to be played from any origin
        response = send_from_directory(directory, filename)
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Origin, Accept, Content-Type, X-Requested-With, X-CSRF-Token'
        
        # Add cache control headers to prevent caching
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        
        return response
    except Exception as e:
        print(f"Error serving stream file: {str(e)}")
        return jsonify({'error': str(e)}), 404

@api_bp.route('/get-rs-timeout')
def get_rs_timeout():
    try:
        config = load_config()
        return jsonify({"timeout": config["reed_switch"]["rs_timeout"]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api_bp.route('/get-reed-switch-mode')
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


@api_bp.route('/toggle-reed-switch-mode', methods=['POST'])
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
