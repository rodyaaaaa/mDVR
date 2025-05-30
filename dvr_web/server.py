import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import re
import shutil
import json
import time
import threading
import RPi.GPIO as GPIO
import signal
import datetime
import subprocess
import psutil

from datetime import timedelta
from flask import Flask, request, jsonify, render_template
from flask_socketio import SocketIO, emit
from pathlib import Path
from dvr_video.data.utils import get_config_path
from routes.api import api_bp, cpu_load_history

CONFIG_PATH = '/opt/mdvr/dvr_video'
CONFIG_FULL_PATH = os.path.join(CONFIG_PATH, 'data_config.json')
DEFAULT_CONFIG_PATH = os.path.join(os.path.dirname(__file__), '../dvr_video/default.json')
SERVICE_PATH = "/etc/systemd/system/mdvr.service"
VPN_CONFIG_PATH = "/etc/wireguard/wg0.conf"
REGULAR_SEARCH_IP = r"\b(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}\b"
NGINX_CONF_DIR = "/etc/nginx/sites-enabled"
BASE_PORT = 10511
REED_SWITCH_PIN = 17

app = Flask(__name__)
app.config['SECRET_KEY'] = 'mdvr_secret_key'
socketio = SocketIO(app, cors_allowed_origins="*")


reed_switch_state = {
    "status": "unknown",
    "timestamp": int(time.time())
}

app.register_blueprint(api_bp, url_prefix='/api')

reed_switch_monitor_active = False
reed_switch_monitor_thread = None
reed_switch_initialized = False
reed_switch_autostop_time = None
REED_SWITCH_AUTOSTOP_SECONDS = 180

# Фоновий потік для збору CPU load
if psutil:
    def cpu_load_collector():
        global cpu_load_history
        while True:
            cpu = psutil.cpu_percent(interval=1)
            cpu_load_history.append(cpu)
            if len(cpu_load_history) > 60:
                cpu_load_history = cpu_load_history[-60:]
    threading.Thread(target=cpu_load_collector, daemon=True).start()

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

# Реєстрація обробників сигналів
signal.signal(signal.SIGINT, cleanup_gpio)
signal.signal(signal.SIGTERM, cleanup_gpio)

if __name__ == '__main__':
    try:
        socketio.run(app, host='0.0.0.0', port=80, allow_unsafe_werkzeug=True)
    finally:
        # Очищення ресурсів GPIO при завершенні програми
        GPIO.cleanup()
        print("GPIO ресурси звільнено")
