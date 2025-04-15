import os
import re
import shutil
import json
import time
import threading
import RPi.GPIO as GPIO
import signal
import sys
import datetime  # Додаємо для обчислення часу таймера

from datetime import timedelta
from flask import Flask, request, jsonify, render_template
from flask_socketio import SocketIO, emit
from pathlib import Path

CONFIG_PATH = '/opt/mdvr/dvr_video'
CONFIG_FULL_PATH = os.path.join(CONFIG_PATH, 'data_config.json')
DEFAULT_CONFIG_PATH = os.path.join(CONFIG_PATH, 'default.json')
SERVICE_PATH = "/etc/systemd/system/mdvr.service"
VPN_CONFIG_PATH = "/etc/wireguard/wg0.conf"
REGULAR_SEARCH_IP = r"\b(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}\b"
NGINX_CONF_DIR = "/etc/nginx/sites-enabled"
BASE_PORT = 10511
REED_SWITCH_PIN = 17  # Змініть на відповідний GPIO пін, до якого підключений геркон

app = Flask(__name__)
app.config['SECRET_KEY'] = 'mdvr_secret_key'
socketio = SocketIO(app, cors_allowed_origins="*")

# Змінна для зберігання стану геркона
reed_switch_state = {
    "status": "unknown",
    "timestamp": int(time.time())
}

# Для контролю потоку моніторингу
reed_switch_monitor_active = False
reed_switch_monitor_thread = None
reed_switch_initialized = False
reed_switch_autostop_time = None  # Час автоматичної зупинки моніторингу
REED_SWITCH_AUTOSTOP_SECONDS = 180  # 3 хвилини (180 секунд)

# Функція для ініціалізації геркона
def initialize_reed_switch():
    global reed_switch_state, reed_switch_initialized, reed_switch_autostop_time, reed_switch_monitor_active
    
    try:
        # Налаштування GPIO
        GPIO.setmode(GPIO.BCM)  # Використовуємо нумерацію BCM
        GPIO.setup(REED_SWITCH_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)  # Налаштовуємо пін як вхід з підтяжкою вгору
        
        # Ініціалізуємо початковий стан геркона
        initial_status = read_reed_switch_state()
        reed_switch_state = {
            "status": initial_status,
            "timestamp": int(time.time())
        }
        
        # Додаємо обробник подій для геркона (обидва фронти: коли замикається і розмикається)
        GPIO.add_event_detect(REED_SWITCH_PIN, GPIO.BOTH, callback=reed_switch_callback, bouncetime=300)
        
        reed_switch_initialized = True
        
        # Встановлюємо час автоматичної зупинки через 3 хвилини
        reed_switch_autostop_time = time.time() + REED_SWITCH_AUTOSTOP_SECONDS
        
        # Запускаємо потік моніторингу, якщо він ще не запущений
        if not reed_switch_monitor_active:
            reed_switch_monitor_active = True
            reed_switch_monitor_thread = threading.Thread(target=monitor_reed_switch)
            reed_switch_monitor_thread.daemon = True
            reed_switch_monitor_thread.start()
        
        print(f"GPIO налаштовано для геркона на піні {REED_SWITCH_PIN}")
        print(f"Початковий стан геркона: {initial_status}")
        print(f"Встановлено автоматичну зупинку через {REED_SWITCH_AUTOSTOP_SECONDS} секунд")
        
        return {"success": True, "status": initial_status}
    except Exception as e:
        error_msg = f"Помилка при ініціалізації геркона: {str(e)}"
        print(error_msg)
        return {"success": False, "error": error_msg}

# Функція для читання стану геркона з GPIO
def read_reed_switch_state():
    try:
        # Використовуємо RPi.GPIO для читання стану геркона
        # За допомогою pull-up резистора:
        # - Коли геркон замкнутий (closed) -> GPIO.HIGH (1)
        # - Коли геркон розімкнутий (open) -> GPIO.LOW (0)
        
        pin_state = GPIO.input(REED_SWITCH_PIN)
        
        if pin_state == GPIO.HIGH:
            return "closed"
        else:
            return "open"
    except Exception as e:
        print(f"Помилка читання стану геркона: {str(e)}")
        return "unknown"

# Функція, яка буде викликатись при зміні стану піна
def reed_switch_callback(channel):
    global reed_switch_state, reed_switch_initialized, reed_switch_autostop_time
    try:
        # Використовуємо функцію read_reed_switch_state() для визначення стану
        new_status = read_reed_switch_state()
        current_time = int(time.time())
        
        reed_switch_state = {
            "status": new_status,
            "timestamp": current_time
        }
        
        # Додаємо інформацію про ініціалізацію та час до зупинки
        status_with_init = reed_switch_state.copy()
        status_with_init["initialized"] = reed_switch_initialized
        
        # Додаємо інформацію про автоматичну зупинку
        if reed_switch_autostop_time:
            seconds_left = max(0, int(reed_switch_autostop_time - time.time()))
            status_with_init["autostop"] = True
            status_with_init["seconds_left"] = seconds_left
        else:
            status_with_init["autostop"] = False
            status_with_init["seconds_left"] = 0
        
        # Відправляємо оновлення через WebSocket
        socketio.emit('reed_switch_update', status_with_init, namespace='/ws')
        print(f"Зміна стану геркона: {new_status} в {current_time}")
    except Exception as e:
        print(f"Помилка в обробнику події GPIO: {str(e)}")

def check_reed_switch_status() -> bool:
    output = os.popen("systemctl is-enabled mdvr_rs.service").read().strip()
    return True if output == "enabled" else False

def restart_mdvr_engine() -> None:
    if check_reed_switch_status():
        os.system("systemctl restart mdvr_rs")
    else:
        os.system("systemctl restart mdvr")

def update_watchdog(value):
    try:
        with open(SERVICE_PATH, 'r') as file:
            lines = file.readlines()

        updated_lines = []
        for line in lines:
            if line.strip().startswith("WatchdogSec="):
                updated_lines.append(f"WatchdogSec={value}\n")
            else:
                updated_lines.append(line)

        with open(SERVICE_PATH, 'w') as file:
            file.writelines(updated_lines)

        os.system("systemctl daemon-reload")

        restart_mdvr_engine()

        return {"success": True, "message": "WatchdogSec updated successfully"}
    except Exception as e:
        return {"success": False, "error": str(e)}

def load_config():
    if not os.path.exists(CONFIG_FULL_PATH):
        shutil.copyfile(DEFAULT_CONFIG_PATH, CONFIG_FULL_PATH)

    with open(CONFIG_FULL_PATH, 'r') as file:
        config = json.load(file)
        if "rtsp_options" not in config:
            config["rtsp_options"] = {
                "rtsp_transport": config.get("video_options", {}).get("rtsp_transport", "tcp"),
                "rtsp_resolution_x": config.get("video_options", {}).get("video_resolution_x", 640),
                "rtsp_resolution_y": config.get("video_options", {}).get("video_resolution_y", 480)
            }
        return config

def generate_nginx_configs(camera_list):
    try:
        for conf_file in Path(NGINX_CONF_DIR).glob('camera*'):
            conf_file.unlink()

        unique_ips = {}
        current_port = BASE_PORT
        config_counter = 1

        for i, rtsp_url in enumerate(camera_list, 1):
            match = re.search(r'@([\d.]+)(:|/)', rtsp_url)
            if not match:
                continue

            cam_ip = match.group(1)

            if cam_ip in unique_ips:
                continue

            unique_ips[cam_ip] = {
                'port': current_port,
                'config_num': config_counter
            }

            conf_content = f"""
server {{
    listen {current_port};
    server_name {cam_ip};

    location / {{
        proxy_pass http://{cam_ip};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }}
}}
            """
            conf_path = Path(NGINX_CONF_DIR) / f"camera{config_counter}"
            with open(conf_path, 'w') as f:
                f.write(conf_content.strip())

            current_port += 1
            config_counter += 1

        os.system("nginx -t")
        os.system('systemctl restart nginx')
        return True
    except Exception as e:
        print(f"Nginx config error: {str(e)}")
        return False

# server.py
def get_camera_ports():
    ports = {}
    try:
        for conf_file in Path(NGINX_CONF_DIR).glob('camera*'):
            with open(conf_file, 'r') as f:
                content = f.read()
                port_match = re.search(r'listen\s+(\d+);', content)
                ip_match = re.search(r'server_name\s+([\d.]+);', content)
                if port_match and ip_match:
                    ports[ip_match.group(1)] = port_match.group(1)
    except Exception as e:
        print(f"Error reading nginx configs: {str(e)}")
    return ports

@app.route('/get-camera-ports')
def get_camera_ports_route():
    return jsonify(get_camera_ports())

def update_imei():
    config = load_config()
    imei = None
    car_name = config['ftp']['car_name']

    vpn_ip = ""

    try:
        with open(VPN_CONFIG_PATH, 'r') as f:
            for line in f:
                if line.startswith('Address'):
                    vpn_ip = re.search(REGULAR_SEARCH_IP, line).group(0)
                    vpn_ip = vpn_ip.replace('.', '')
    except Exception as e:
        print(e)

    print(vpn_ip)

    if car_name and vpn_ip:
        space = 15 - (len(car_name) + len(vpn_ip))
        print(space)
        imei = str(car_name) + ('0' * space) + str(vpn_ip)

        config['program_options']['imei'] = imei
        with open(CONFIG_FULL_PATH, 'w') as file:
            json.dump(config, file, indent=4)

@app.route('/save-write-mode', methods=['POST'])
def save_write_mode():
    data = request.get_json()
    try:
        config = load_config()
        config['program_options']['photo_mode'] = 0 if data.get('write_mode') == 'video' else 1

        with open(CONFIG_FULL_PATH, 'w') as file:
            json.dump(config, file, indent=4)

        restart_mdvr_engine()

        return jsonify({"success": True, "message": "Write mode updated"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/save-video-links', methods=['POST'])
def save_video_links():
    data = request.get_json()
    try:
        config = load_config()
        camera_list = data.get('camera_list', [])
        config['camera_list'] = camera_list

        with open(CONFIG_FULL_PATH, 'w') as file:
            json.dump(config, file, indent=4)

        if not generate_nginx_configs(camera_list):
            raise Exception("Failed to generate Nginx configs")

        restart_mdvr_engine()

        return jsonify({"success": True, "message": "Video links saved successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/save-ftp-config', methods=['POST'])
def save_ftp_config():
    data = request.get_json()
    try:
        config = load_config()

        ftp_data = data.get('ftp', {})
        config['ftp'] = {
            "server": ftp_data.get('server', ''),
            "port": ftp_data.get('port', 21),
            "user": ftp_data.get('user', ''),
            "password": ftp_data.get('password', ''),
            "car_name": ftp_data.get('car_name', '')
        }

        with open(CONFIG_FULL_PATH, 'w') as file:
            json.dump(config, file, indent=4)
        
        # Оновлення IMEI після збереження FTP конфігурації
        update_imei()

        return jsonify({"success": True, "message": "FTP settings saved!"})
    except Exception as e:
        return jsonify({"success": False, "error": f"Error: {str(e)}"}), 500

@app.route('/save-video-options', methods=['POST'])
def save_video_options():
    data = request.get_json()
    try:
        config = load_config()

        config['program_options']['size_folder_limit_gb'] = int(data.get('folder_size'))

        config['rtsp_options'] = {
            "rtsp_transport": data.get('rtsp_transport', 'tcp'),
            "rtsp_resolution_x": data.get('rtsp_resolution_x', 640),
            "rtsp_resolution_y": data.get('rtsp_resolution_y', 480)
        }

        video_duration = data.get('video_duration')
        if video_duration:
            video_duration = video_duration.strip().lower()
            cleaned_duration = ''.join([c for c in video_duration if c.isdigit() or c == ':'])
            if ':' in cleaned_duration:
                parts = cleaned_duration.split(':')
                if len(parts) != 3:
                    raise ValueError("Incorrect format. Use HH:MM:SS or minutes (e.g., '10 min').")
                h, m, s = map(int, parts)
            else:
                try:
                    minutes = int(cleaned_duration)
                    h = minutes // 60
                    m = minutes % 60
                    s = 0
                except ValueError:
                    raise ValueError("Incorrect format for minutes. For example: '10' or '10 min'.")

            if m > 59 or s > 59:
                raise ValueError("Invalid minutes/seconds values (must be ≤ 59).")

            formatted_duration = f"{h:02d}:{m:02d}:{s:02d}"
            config['video_options']['video_duration'] = formatted_duration
            config['video_options']['fps'] = data.get('fps', 15)

            seconds = timedelta(hours=h, minutes=m, seconds=s).total_seconds()
            update_watchdog(int(seconds * 10))

        photo_timeout = data['photo_timeout']

        if photo_timeout:
            config['photo_timeout'] = int(photo_timeout)
            update_watchdog(int(photo_timeout * 5))

        with open(CONFIG_FULL_PATH, 'w') as file:
            json.dump(config, file, indent=4)

        restart_mdvr_engine()

        return jsonify({"success": True, "message": "Settings saved!"})

    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/save-vpn-config', methods=['POST'])
def save_vpn_config():
    data = request.get_json()
    if not data or 'vpn_config' not in data:
        return jsonify({"success": False, "error": "No config data received"}), 400

    try:
        with open(VPN_CONFIG_PATH, 'w') as file:
            file.write(data['vpn_config'])

        os.system("systemctl enable wg-quick@wg0")
        os.system("systemctl restart wg-quick@wg0")
        
        # Оновлення IMEI після зміни VPN конфігурації
        update_imei()
        
        return jsonify({"success": True, "message": "VPN config saved successfully"})
    except Exception as e:
        os.system("systemctl restart wg-quick@wg0")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/toggle-reed-switch', methods=['POST'])
def toggle_reed_switch():
    data = request.get_json()
    state = data.get("reed_switch", "off")
    try:
        if state == "on":
            os.system("systemctl stop mdvr.service")
            os.system("systemctl disable mdvr.service")
            os.system("systemctl enable mdvr_rs.service")
            os.system("systemctl start mdvr_rs.service")
        else:
            os.system("systemctl stop mdvr_rs.service")
            os.system("systemctl disable mdvr_rs.service")
            os.system("systemctl enable mdvr.service")
            os.system("systemctl start mdvr.service")
        return jsonify({"success": True, "message": "Reed Switch toggled successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/get-reed-switch-status')
def get_reed_switch_status():
    try:
        output = os.popen("systemctl is-enabled mdvr_rs.service").read().strip()
        state = "on" if output == "enabled" else "off"
        return jsonify({"state": state})
    except Exception as e:
        return jsonify({"state": "off", "error": str(e)})

@app.route('/get-imei')
def get_imei():
    try:
        config = load_config()
        return jsonify({"imei": config['program_options']['imei']})
    except Exception as e:
        return jsonify({"imei": "", "error": str(e)})

@app.route('/get-service-status/<service_name>')
def get_service_status(service_name):
    try:
        status = os.popen(f"systemctl is-active {service_name}").read().strip()
        enabled = os.popen(f"systemctl is-enabled {service_name}").read().strip()
        return jsonify({
            "status": status,
            "enabled": enabled == "enabled"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/')
def index():
    update_imei()
    config = load_config()
    camera_list = config['camera_list']

    vpn_config = ""
    try:
        if os.path.exists(VPN_CONFIG_PATH):
            with open(VPN_CONFIG_PATH, 'r') as f:
                vpn_config = f.read()
    except Exception as e:
        print(f"Error reading VPN config: {str(e)}")

    if not generate_nginx_configs(camera_list):
        raise Exception("Failed to generate Nginx configs")

    return render_template('index.html',
                           vpn_config=vpn_config,
                           **config
                           )

# Функція для опитування стану геркона з певною періодичністю
def monitor_reed_switch():
    global reed_switch_state, reed_switch_monitor_active, reed_switch_initialized, reed_switch_autostop_time
    
    while reed_switch_monitor_active:
        try:
            current_time = time.time()
            
            # Перевіряємо, чи настав час автоматичної зупинки
            if reed_switch_initialized and reed_switch_autostop_time and current_time >= reed_switch_autostop_time:
                print("Автоматична зупинка моніторингу після 3 хвилин")
                # Очищаємо ресурси GPIO
                GPIO.cleanup(REED_SWITCH_PIN)
                reed_switch_initialized = False
                reed_switch_autostop_time = None
                
                # Відправляємо повідомлення про зупинку всім клієнтам
                socketio.emit('reed_switch_update', {
                    "status": "unknown",
                    "timestamp": int(current_time),
                    "initialized": False,
                    "autostop": True,
                    "seconds_left": 0
                }, namespace='/ws')
                
                continue
            
            # Перевіряємо, чи геркон ініціалізовано
            if not reed_switch_initialized:
                # Відправляємо статус "не ініціалізовано"
                socketio.emit('reed_switch_update', {
                    "status": "unknown",
                    "timestamp": int(current_time),
                    "initialized": False,
                    "autostop": False,
                    "seconds_left": 0
                }, namespace='/ws')
                time.sleep(1)
                continue
            
            # Оскільки ми тепер використовуємо обробку подій для миттєвих оновлень,
            # цей цикл буде використовуватися тільки для періодичного оновлення клієнтів
            # щоб переконатися, що вони мають актуальний стан
            
            # Оновлюємо клієнтів кожні 10 секунд або коли залишилось мало часу до зупинки
            seconds_left = int(reed_switch_autostop_time - current_time) if reed_switch_autostop_time else 0
            update_interval = 1 if seconds_left <= 10 else 10  # Частіше оновлюємо в останні 10 секунд
            
            if current_time - reed_switch_state["timestamp"] >= update_interval:
                # Оновлюємо стан геркона
                current_status = read_reed_switch_state()
                
                reed_switch_state = {
                    "status": current_status,
                    "timestamp": int(current_time)
                }
                
                # Додаємо статус ініціалізації та час до зупинки
                status_with_init = reed_switch_state.copy()
                status_with_init["initialized"] = reed_switch_initialized
                status_with_init["autostop"] = reed_switch_autostop_time is not None
                status_with_init["seconds_left"] = max(0, seconds_left)
                
                # Відправляємо дані через WebSocket всім підключеним клієнтам
                socketio.emit('reed_switch_update', status_with_init, namespace='/ws')
            
            time.sleep(1)
        except Exception as e:
            print(f"Помилка в моніторингу геркона: {str(e)}")
            time.sleep(5)

# WebSocket події
@socketio.on('connect', namespace='/ws')
def ws_connect(auth):
    global reed_switch_monitor_active, reed_switch_monitor_thread
    
    print(f"WebSocket клієнт підключився: {request.sid}")
    
    # Запускаємо моніторинг геркона, якщо він ще не запущений
    if not reed_switch_monitor_active:
        reed_switch_monitor_active = True
        reed_switch_monitor_thread = threading.Thread(target=monitor_reed_switch)
        reed_switch_monitor_thread.daemon = True
        reed_switch_monitor_thread.start()

@socketio.on('disconnect', namespace='/ws')
def ws_disconnect():
    print(f"WebSocket клієнт відключився: {request.sid}")
    
    # Перевіряємо, чи ще є підключені клієнти
    if not socketio.server.manager.rooms.get('/ws', {}):
        global reed_switch_monitor_active
        reed_switch_monitor_active = False

@socketio.on('get_status', namespace='/ws')
def ws_get_status():
    global reed_switch_state, reed_switch_initialized, reed_switch_autostop_time
    
    # Перевіряємо, чи геркон ініціалізовано
    if not reed_switch_initialized:
        emit('reed_switch_update', {
            "status": "unknown",
            "timestamp": int(time.time()),
            "initialized": False,
            "autostop": False,
            "seconds_left": 0
        })
        return
    
    # Оновлюємо поточний стан перед відправкою
    try:
        current_status = read_reed_switch_state()
        current_time = int(time.time())
        
        reed_switch_state = {
            "status": current_status,
            "timestamp": current_time
        }
    except Exception as e:
        print(f"Помилка при оновленні стану геркона: {str(e)}")
    
    # Додаємо інформацію про ініціалізацію
    response = reed_switch_state.copy()
    response["initialized"] = reed_switch_initialized
    
    # Додаємо інформацію про автоматичну зупинку
    if reed_switch_autostop_time:
        seconds_left = max(0, int(reed_switch_autostop_time - time.time()))
        response["autostop"] = True
        response["seconds_left"] = seconds_left
    else:
        response["autostop"] = False
        response["seconds_left"] = 0
    
    # Відправляємо поточний стан геркона клієнту, який запитав
    emit('reed_switch_update', response)

# REST API для отримання поточного стану геркона
@app.route('/api/reed-switch-status')
def api_reed_switch_status():
    global reed_switch_state, reed_switch_initialized, reed_switch_autostop_time
    
    # Перевіряємо, чи геркон ініціалізовано
    if not reed_switch_initialized:
        return jsonify({
            "status": "unknown",
            "timestamp": int(time.time()),
            "initialized": False,
            "autostop": False,
            "seconds_left": 0
        })
    
    # Оновлюємо поточний стан перед відправкою через API
    try:
        current_status = read_reed_switch_state()
        current_time = int(time.time())
        
        reed_switch_state = {
            "status": current_status,
            "timestamp": current_time
        }
    except Exception as e:
        print(f"Помилка при оновленні стану геркона через API: {str(e)}")
    
    # Додаємо інформацію про ініціалізацію
    response = reed_switch_state.copy()
    response["initialized"] = reed_switch_initialized
    
    # Додаємо інформацію про автоматичну зупинку
    if reed_switch_autostop_time:
        seconds_left = max(0, int(reed_switch_autostop_time - time.time()))
        response["autostop"] = True
        response["seconds_left"] = seconds_left
    else:
        response["autostop"] = False
        response["seconds_left"] = 0
    
    return jsonify(response)

# Новий API маршрут для ініціалізації геркона
@app.route('/api/initialize-reed-switch', methods=['POST'])
def api_initialize_reed_switch():
    global reed_switch_initialized, reed_switch_autostop_time
    
    # Перевіряємо, чи перемикач Reed Switch у положенні OFF
    rs_status = check_reed_switch_status()
    if rs_status:
        error_msg = "Помилка: Перемикач Reed Switch в налаштуваннях повинен бути у положенні OFF перед ініціалізацією геркона"
        print(error_msg)
        return jsonify({
            "success": False, 
            "error": error_msg,
            "reed_switch_enabled": True
        })
    
    # Якщо геркон вже ініціалізовано, спочатку звільняємо ресурси
    if reed_switch_initialized:
        try:
            GPIO.cleanup(REED_SWITCH_PIN)
        except Exception as e:
            print(f"Помилка при очищенні GPIO: {str(e)}")
    
    # Скидаємо час автоматичної зупинки
    reed_switch_autostop_time = None
    
    # Ініціалізуємо геркон
    result = initialize_reed_switch()
    
    # Додаємо інформацію про автоматичну зупинку
    if result["success"] and reed_switch_autostop_time:
        result["autostop"] = True
        result["seconds_left"] = REED_SWITCH_AUTOSTOP_SECONDS
    else:
        result["autostop"] = False
        result["seconds_left"] = 0
    
    return jsonify(result)

# Новий API маршрут для зупинки моніторингу геркона
@app.route('/api/stop-reed-switch', methods=['POST'])
def api_stop_reed_switch():
    global reed_switch_initialized, reed_switch_monitor_active, reed_switch_autostop_time
    
    try:
        # Зупиняємо моніторинг геркона
        reed_switch_monitor_active = False
        
        # Скидаємо час автоматичної зупинки
        reed_switch_autostop_time = None
        
        # Очищаємо ресурси GPIO
        if reed_switch_initialized:
            GPIO.cleanup(REED_SWITCH_PIN)
            reed_switch_initialized = False
        
        return jsonify({"success": True, "message": "Моніторинг геркона зупинено"})
    except Exception as e:
        error_msg = f"Помилка при зупинці моніторингу геркона: {str(e)}"
        print(error_msg)
        return jsonify({"success": False, "error": error_msg})

# Функція для очищення ресурсів GPIO
def cleanup_gpio(signal=None, frame=None):
    print("Очищення ресурсів GPIO...")
    GPIO.cleanup()
    sys.exit(0)

# Реєстрація обробників сигналів
signal.signal(signal.SIGINT, cleanup_gpio)
signal.signal(signal.SIGTERM, cleanup_gpio)

if __name__ == '__main__':
    try:
        socketio.run(app, host='192.168.1.1', port=80)
    finally:
        # Очищення ресурсів GPIO при завершенні програми
        GPIO.cleanup()
        print("GPIO ресурси звільнено")
