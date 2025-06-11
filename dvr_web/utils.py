import json
import os
import re
import shutil
import sys
import threading
import time
import RPi.GPIO as GPIO

from pathlib import Path
from flask_socketio import SocketIO

from dvr_video.data.utils import get_config_path
from dvr_web.constants import BASE_PORT, DEFAULT_CONFIG_PATH, NGINX_CONF_DIR, REED_SWITCH_AUTOSTOP_SECONDS, REED_SWITCH_PIN, REGULAR_SEARCH_IP, SERVICE_PATH, VPN_CONFIG_PATH


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
            return "open"
        else:
            return "closed"
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
    output = os.popen("systemctl is-enabled mdvr_rs.timer").read().strip()
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
    config_path = get_config_path()
    if not os.path.exists(config_path):
        shutil.copyfile(DEFAULT_CONFIG_PATH, config_path)
    with open(config_path, 'r') as file:
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
        with open(get_config_path(), 'w') as file:
            json.dump(config, file, indent=4)


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


# Функція для очищення ресурсів GPIO
def cleanup_gpio(signal=None, frame=None):
    print("Очищення ресурсів GPIO...")
    GPIO.cleanup()
    sys.exit(0)
