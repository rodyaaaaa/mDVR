import os
import shutil
import signal
import json
import re
import sys
import threading
import time
import dvr_web.routes.api
import RPi.GPIO as GPIO

from pathlib import Path
from flask import request

from dvr_web.constants import BASE_PORT, DEFAULT_CONFIG_PATH, NGINX_CONF_DIR, REED_SWITCH_AUTOSTOP_SECONDS, REED_SWITCH_PIN, REGULAR_SEARCH_IP, SERVICE_PATH, VPN_CONFIG_PATH, CONFIG_FILENAME

# Define our own config path function for the web interface
def get_config_path():
    config_dir = '/etc/mdvr'
    os.makedirs(config_dir, exist_ok=True)
    return os.path.join(config_dir, CONFIG_FILENAME)

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


# Функція для ініціалізації геркона через єдиний інтерфейс
from dvr_web.reed_switch_interface import RSFactory

global_reed_switch = None  # Глобальний об'єкт геркона

def initialize_reed_switch():
    global reed_switch_state, reed_switch_initialized, reed_switch_autostop_time, reed_switch_monitor_active, global_reed_switch
    try:
        print(f"[DEBUG] Початок ініціалізації геркона через RSFactory")
        config = load_config()
        impulse = 0
        if "reed_switch" in config and "impulse" in config["reed_switch"]:
            impulse = config["reed_switch"]["impulse"]
        # Створюємо об'єкт геркона через фабрику лише один раз
        if global_reed_switch is not None:
            # Якщо вже був створений, спробуємо його "перезібрати" (можливо, додати .close() у майбутньому)
            try:
                if hasattr(global_reed_switch, 'btn_a') and global_reed_switch.btn_a:
                    global_reed_switch.btn_a.close()
                if hasattr(global_reed_switch, 'btn_b') and global_reed_switch.btn_b:
                    global_reed_switch.btn_b.close()
            except Exception as e:
                print(f"[DEBUG] Не вдалося закрити попередні Button: {e}")
        global_reed_switch = RSFactory.create(bool(impulse))
        global_reed_switch.setup()
        initial_status = "opened" if global_reed_switch.pressed() else "closed"
        print(f"[DEBUG] Початковий стан геркона (RSFactory): {initial_status}")
        reed_switch_state = {
            "status": initial_status,
            "timestamp": int(time.time())
        }
        reed_switch_initialized = True
        reed_switch_autostop_time = time.time() + REED_SWITCH_AUTOSTOP_SECONDS
        if not reed_switch_monitor_active and monitor_reed_switch is not None:
            reed_switch_monitor_active = True
            reed_switch_monitor_thread = threading.Thread(target=monitor_reed_switch)
            reed_switch_monitor_thread.daemon = True
            reed_switch_monitor_thread.start()
            print(f"[DEBUG] Запущено потік моніторингу геркона через RSFactory")
        return {"success": True, "status": initial_status}
    except Exception as e:
        error_msg = f"Помилка при ініціалізації геркона: {str(e)}"
        print(f"[DEBUG] {error_msg}")
        return {"success": False, "error": error_msg}


# Функція для читання стану геркона через єдиний інтерфейс
def read_reed_switch_state():
    """
    Зчитує стан геркона через глобальний об'єкт (RSFactory singleton).
    Повертає "closed" якщо геркон замкнутий (магніт присутній),
    "opened" якщо геркон розімкнутий,
    "unknown" якщо стан не вдалося визначити.
    """
    global global_reed_switch
    try:
        if global_reed_switch is None:
            print("[DEBUG] Глобальний об'єкт геркона не створено, ініціалізую...")
            initialize_reed_switch()
        if global_reed_switch is None:
            print("[DEBUG] Не вдалося створити об'єкт геркона")
            return "unknown"
        pressed = global_reed_switch.pressed()
        if pressed is True:
            return "opened"
        elif pressed is False:
            return "closed"
        else:
            return "unknown"
    except Exception as e:
        print(f"[DEBUG] Помилка при читанні стану геркона через RSFactory: {str(e)}")
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
    
    # Check if file is empty
    if os.path.getsize(config_path) == 0:
        print(f"Config file {config_path} is empty, copying default config")
        shutil.copyfile(DEFAULT_CONFIG_PATH, config_path)
        
    with open(config_path, 'r') as file:
        try:
            config = json.load(file)
        except json.JSONDecodeError as e:
            # If JSON is corrupted, use the default config
            print(f"Error decoding JSON: {str(e)}. Using default config instead.")
            shutil.copyfile(DEFAULT_CONFIG_PATH, config_path)
            with open(config_path, 'r') as default_file:
                config = json.load(default_file)
                
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
    try:
        config = load_config()
        car_name = None
        
        # Only get car_name from the ftp section
        if 'ftp' in config and 'car_name' in config['ftp']:
            car_name = config['ftp']['car_name']
        
        # If car_name is not found, use a default value
        if not car_name:
            car_name = "000"  # Default car name if not specified in FTP settings
        
        vpn_ip = ''

        try:
            with open(VPN_CONFIG_PATH, 'r') as f:
                for line in f:
                    if line.startswith('Address'):
                        ip_match = re.search(REGULAR_SEARCH_IP, line)
                        if ip_match:
                            vpn_ip = ip_match.group(0)
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
                return True
            except Exception as e:
                print(f"Error updating IMEI: {e}")
                return False
        else:
            print("Cannot update IMEI: Missing car_name or vpn_ip")
            return False
    except Exception as e:
        print(f"Critical error in update_imei: {str(e)}")
        return False


# Функція для очищення ресурсів GPIO при завершенні програми
def cleanup_gpio(signum=None, frame=None):
    """
    Функція для звільнення ресурсів GPIO при завершенні програми.
    """
    try:
        # Зупиняємо моніторинг CPU
        try:
            dvr_web.routes.api.cpu_monitor_active = False
        except:
            pass
            
        GPIO.cleanup()
        print("GPIO ресурси звільнено")
    except:
        pass


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
