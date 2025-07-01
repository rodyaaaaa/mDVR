import os
import signal
import sys
# Add the parent directory to the path so we can import the dvr_web package
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import atexit
import RPi.GPIO as GPIO

from flask import Flask, render_template, request, redirect, url_for
from flask_cors import CORS

# Now import using relative imports
from dvr_web.routes.api import api_bp, start_cpu_monitoring
from dvr_web.routes.web import web_bp
from dvr_web.routes.reed_switch import reed_switch_bp
from dvr_web.utils import cleanup_gpio, generate_nginx_configs, load_config, update_imei
from dvr_web.constants import VPN_CONFIG_PATH, REED_SWITCH_PIN
from dvr_web.sockets import init_socketio

def create_app():
    """
    Створює та налаштовує екземпляр Flask додатку.
    """
    app = Flask(__name__)
    
    # Налаштування CORS для HTTP запитів
    CORS(app, resources={r"/*": {"origins": "*"}})
    
    # Додаємо конфігурацію для Flask та Socket.IO
    app.config['SECRET_KEY'] = 'mdvr-secret-key'
    app.config['JSON_AS_ASCII'] = False
    app.config['CORS_HEADERS'] = 'Content-Type'
    
    # Додаємо додаткові налаштування для Socket.IO
    app.config['SOCKETIO_CORS_ALLOWED_ORIGINS'] = '*'
    app.config['SOCKETIO_ASYNC_MODE'] = 'threading'
    
    # Реєстрація Blueprint маршрутів
    app.register_blueprint(web_bp)
    app.register_blueprint(api_bp, url_prefix='/api')
    app.register_blueprint(reed_switch_bp, url_prefix='/reed-switch')
    
    # Додаємо обробник кореневого маршруту
    @app.route('/')
    def index():
        # Оновлюємо інформацію про IMEI
        update_imei()
        
        # Завантажуємо конфігурацію
        config = load_config()
        camera_list = config['camera_list']
        
        # Зчитуємо конфігурацію VPN
        vpn_config = ""
        try:
            if os.path.exists(VPN_CONFIG_PATH):
                with open(VPN_CONFIG_PATH, 'r') as f:
                    vpn_config = f.read()
        except Exception as e:
            print(f"Error reading VPN config: {str(e)}")
        
        # Генеруємо конфігурації Nginx
        if not generate_nginx_configs(camera_list):
            print("Warning: Failed to generate Nginx configs")
        
        # Рендеримо головний шаблон
        return render_template('index.html',
                            vpn_config=vpn_config,
                            **config
                            )
        
    return app


def start_server(debug=False, host='0.0.0.0', port=8080):
    """
    Запускає сервер з веб-інтерфейсом.
    """
    app = create_app()
    
    # Ініціалізація Socket.IO з покращеними налаштуваннями
    socketio = init_socketio(app)
    
    # Запуск моніторингу CPU
    start_cpu_monitoring()
    
    # Реєстрація функції для очищення ресурсів GPIO при завершенні
    atexit.register(cleanup_gpio)
    
    # Запуск сервера
    socketio.run(app, debug=debug, host=host, port=port, allow_unsafe_werkzeug=True)

# Реєстрація обробників сигналів
signal.signal(signal.SIGINT, cleanup_gpio)
signal.signal(signal.SIGTERM, cleanup_gpio)

if __name__ == '__main__':
    try:
        start_server(host='0.0.0.0', port=80)
    finally:
        cleanup_gpio()
