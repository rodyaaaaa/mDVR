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
from pathlib import Path
from dvr_video.data.utils import get_config_path
from routes.api import api_bp, cpu_load_history
from routes.web import web_bp
from routes.reed_switch import reed_switch_bp
from dvr_web.utils import cleanup_gpio, generate_nginx_configs, load_config, update_imei
from dvr_web.constants import (
    CONFIG_PATH, CONFIG_FULL_PATH, DEFAULT_CONFIG_PATH, SERVICE_PATH,
    VPN_CONFIG_PATH, REGULAR_SEARCH_IP, NGINX_CONF_DIR, BASE_PORT,
    REED_SWITCH_PIN, REED_SWITCH_AUTOSTOP_SECONDS
)
from dvr_web.sockets import init_socketio

app = Flask(__name__)
app.config['SECRET_KEY'] = 'mdvr_secret_key'
socketio = init_socketio(app)

app.register_blueprint(api_bp, url_prefix='/api')
app.register_blueprint(web_bp, url_prefix='/web')
app.register_blueprint(reed_switch_bp, url_prefix='/reed_switch')

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
