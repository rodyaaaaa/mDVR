import os
import shutil
import signal
import json
import re
import sys
import threading
import time
from pathlib import Path

import RPi.GPIO as GPIO  # Add RPi.GPIO import

from flask import request

from dvr_video.data.utils import get_config_path
from dvr_web.constants import BASE_PORT, DEFAULT_CONFIG_PATH, NGINX_CONF_DIR, REED_SWITCH_AUTOSTOP_SECONDS, REED_SWITCH_PIN, REGULAR_SEARCH_IP, SERVICE_PATH, VPN_CONFIG_PATH

# Initialize GPIO at module level
GPIO.setwarnings(False)  # Disable warnings
GPIO.setmode(GPIO.BCM)  # Use BCM numbering like in main_rs.py

# Global variables for reed switch state
reed_switch_initialized = False
reed_switch_monitor_active = False
reed_switch_state = {"status": "unknown", "timestamp": 0}
reed_switch_autostop_time = None

# Forward reference to the monitor_reed_switch function from reed_switch.py
# This will be resolved at runtime
monitor_reed_switch = None

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
        print(f"[DEBUG] Початок ініціалізації геркона на піні {REED_SWITCH_PIN}")
        
        # Налаштування GPIO з використанням RPi.GPIO
        GPIO.setup(REED_SWITCH_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        
        # Ініціалізуємо початковий стан геркона
        gpio_value = GPIO.input(REED_SWITCH_PIN)
        initial_status = "open" if gpio_value == GPIO.HIGH else "closed"
        
        print(f"[DEBUG] Успішно налаштовано GPIO. Зчитане значення: {gpio_value}, статус: {initial_status}")
        
        reed_switch_state = {
            "status": initial_status,
            "timestamp": int(time.time())
        }
        
        reed_switch_initialized = True
        
        # Встановлюємо час автоматичної зупинки через вказаний час
        reed_switch_autostop_time = time.time() + REED_SWITCH_AUTOSTOP_SECONDS
        
        # Запускаємо потік моніторингу, якщо він ще не запущений
        if not reed_switch_monitor_active and monitor_reed_switch is not None:
            reed_switch_monitor_active = True
            reed_switch_monitor_thread = threading.Thread(target=monitor_reed_switch)
            reed_switch_monitor_thread.daemon = True
            reed_switch_monitor_thread.start()
            print(f"[DEBUG] Запущено потік моніторингу геркона")
        
        print(f"[DEBUG] GPIO налаштовано для геркона на піні {REED_SWITCH_PIN}")
        print(f"[DEBUG] Початковий стан геркона: {initial_status}")
        print(f"[DEBUG] Встановлено автоматичну зупинку через {REED_SWITCH_AUTOSTOP_SECONDS} секунд")
        print(f"[DEBUG] reed_switch_initialized = {reed_switch_initialized}")
        
        return {"success": True, "status": initial_status}
    except Exception as e:
        error_msg = f"Помилка при ініціалізації геркона: {str(e)}"
        print(f"[DEBUG] {error_msg}")
        return {"success": False, "error": error_msg}


# Функція для читання стану геркона з GPIO
def read_reed_switch_state():
    """
    Зчитує стан геркона.
    Повертає "closed" якщо геркон замкнутий (магніт присутній),
    "opened" якщо геркон розімкнутий,
    "unknown" якщо стан не вдалося визначити.
    """
    try:
        # Для підвищення стабільності, робимо кілька зчитувань
        readings = []
        for _ in range(3):  # 3 зчитування підряд
            # Використання RPi.GPIO для читання стану
            gpio_value = GPIO.input(REED_SWITCH_PIN)
            readings.append(gpio_value)
            time.sleep(0.01)  # Невелика затримка між зчитуваннями
            
        # Вибираємо найбільш часте значення (мажоритарне голосування)
        gpio_value = max(set(readings), key=readings.count)
        
        print(f"[DEBUG] Зчитані значення геркона: {readings}, вибрано {gpio_value}")
            
        # У RPi.GPIO:
        # GPIO.HIGH (1) = розімкнутий (магніт відсутній)
        # GPIO.LOW (0) = замкнутий (магніт присутній)
        if gpio_value == GPIO.LOW:
            return "closed"
        elif gpio_value == GPIO.HIGH:
            return "opened"
        else:
            return "unknown"
    except Exception as e:
        print(f"[DEBUG] Помилка при читанні стану геркона: {str(e)}")
        return "unknown"


# Функцію reed_switch_callback більше не використовуємо, але залишаємо
# порожню для сумісності з існуючим кодом
def reed_switch_callback(channel):
    pass


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
        
        # Ensure required sections exist
        if "rtsp_options" not in config:
            config["rtsp_options"] = {"rtsp_x": 640, "rtsp_y": 480}
        
        if "program_options" not in config:
            config["program_options"] = {"photo_mode": 0, "size_folder_limit_gb": 10, "imei": 0}
        
        # Handle car_name
        if "car_name" not in config["program_options"] and "ftp" in config and "car_name" in config["ftp"]:
            config["program_options"]["car_name"] = config["ftp"]["car_name"]
        elif "car_name" not in config["program_options"]:
            config["program_options"]["car_name"] = "MDVR"
        
        # Handle rs_timeout - ensure it's only at the root level
        # If it exists in program_options, move it to root level if not already there
        if "rs_timeout" in config["program_options"]:
            if "rs_timeout" not in config:
                config["rs_timeout"] = config["program_options"]["rs_timeout"]
            # Remove from program_options to avoid duplication
            del config["program_options"]["rs_timeout"]
        elif "rs_timeout" not in config:
            # Set default if not present anywhere
            config["rs_timeout"] = 2
        
        # Save changes back to the config file
        with open(config_path, 'w') as write_file:
            json.dump(config, write_file, indent=4)
        
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


def update_imei():
    config = load_config()
    car_name = None
    
    # Try to get car_name from program_options first
    if 'program_options' in config and 'car_name' in config['program_options']:
        car_name = config['program_options']['car_name']
    # If not found, try to get it from ftp section
    elif 'ftp' in config and 'car_name' in config['ftp']:
        car_name = config['ftp']['car_name']
        # Also add it to program_options for future use
        if 'program_options' not in config:
            config['program_options'] = {}
        config['program_options']['car_name'] = car_name
    
    # If car_name is still not found, use a default value
    if not car_name:
        car_name = "MDVR"
        if 'program_options' not in config:
            config['program_options'] = {}
        config['program_options']['car_name'] = car_name
    
    vpn_ip = ''

    try:
        with open(VPN_CONFIG_PATH, 'r') as f:
            for line in f:
                if line.startswith('Address'):
                    vpn_ip = re.search(REGULAR_SEARCH_IP, line).group(0)
                    vpn_ip = vpn_ip.replace('.', '')
    except Exception as e:
        print(f"Error reading VPN config: {e}")

    print(f"Car name: {car_name}, VPN IP: {vpn_ip}")

    if car_name and vpn_ip:
        try:
            space = max(0, 15 - (len(car_name) + len(vpn_ip)))
            print(f"Space padding: {space}")
            imei = str(car_name) + ('0' * space) + str(vpn_ip)

            if 'program_options' not in config:
                config['program_options'] = {}
            config['program_options']['imei'] = imei
            
            with open(get_config_path(), 'w') as file:
                json.dump(config, file, indent=4)
            
            print(f"IMEI updated to: {imei}")
        except Exception as e:
            print(f"Error updating IMEI: {e}")
    else:
        print("Cannot update IMEI: Missing car_name or vpn_ip")


# Функція для очищення ресурсів GPIO при завершенні програми
def cleanup_gpio(signal=None, frame=None):
    try:
        # Використовуємо RPi.GPIO для очищення
        GPIO.cleanup(REED_SWITCH_PIN)
        print(f"GPIO ресурси для піна {REED_SWITCH_PIN} звільнено")
    except Exception as e:
        print(f"Помилка при звільненні GPIO ресурсів: {str(e)}")


# Функція для надсилання WebSocket повідомлення
def emit_reed_switch_update(status_data):
    # Імпортуємо socketio локально, щоб уникнути циклічних імпортів
    try:
        from dvr_web.sockets import socketio
        if socketio:
            socketio.emit('reed_switch_update', status_data, namespace='/ws')
    except ImportError:
        print("Помилка: не вдалося імпортувати socketio")
    except Exception as e:
        print(f"Помилка при відправці WebSocket повідомлення: {str(e)}")


# Функція для синхронізації стану геркона між різними модулями
def sync_reed_switch_state(initialized=None, monitor_active=None, state=None, autostop_time=None):
    """
    Синхронізує стан геркона між різними модулями.
    Функція оновлює глобальні змінні в поточному модулі та socketio атрибути
    """
    global reed_switch_initialized, reed_switch_monitor_active, reed_switch_state, reed_switch_autostop_time
    
    # Якщо передано параметр initialized, оновлюємо стан ініціалізації
    if initialized is not None:
        reed_switch_initialized = initialized
        print(f"[DEBUG SYNC] Оновлено reed_switch_initialized = {initialized}")
    
    # Якщо передано параметр monitor_active, оновлюємо стан активності моніторингу
    if monitor_active is not None:
        reed_switch_monitor_active = monitor_active
        print(f"[DEBUG SYNC] Оновлено reed_switch_monitor_active = {monitor_active}")
    
    # Якщо передано параметр state, оновлюємо стан геркона
    if state is not None:
        reed_switch_state = state
        print(f"[DEBUG SYNC] Оновлено reed_switch_state = {state}")
    
    # Якщо передано параметр autostop_time, оновлюємо час автоматичної зупинки
    if autostop_time is not None:
        reed_switch_autostop_time = autostop_time
        print(f"[DEBUG SYNC] Оновлено reed_switch_autostop_time = {autostop_time}")

    # Також оновлюємо відповідні змінні в socketio
    try:
        from dvr_web.sockets import socketio
        if socketio:
            if initialized is not None:
                socketio.reed_switch_initialized = initialized
            if monitor_active is not None:
                socketio.reed_switch_monitor_active = monitor_active
            if state is not None:
                socketio.reed_switch_state = state
            if autostop_time is not None:
                socketio.reed_switch_autostop_time = autostop_time
    except ImportError:
        pass

    # Також оновлюємо відповідні змінні в api модулі
    try:
        from dvr_web.routes import api
        if initialized is not None:
            api.reed_switch_initialized = initialized
        if monitor_active is not None:
            api.reed_switch_monitor_active = monitor_active
        if state is not None:
            api.reed_switch_state = state
        if autostop_time is not None:
            api.reed_switch_autostop_time = autostop_time
    except ImportError:
        pass

    return {
        "initialized": reed_switch_initialized,
        "monitor_active": reed_switch_monitor_active,
        "state": reed_switch_state,
        "autostop_time": reed_switch_autostop_time
    }
