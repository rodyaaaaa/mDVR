import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from flask import Flask, render_template
from flask_cors import CORS

from dvr_web.routes.api import api_bp, start_cpu_monitoring
from dvr_web.routes.web import web_bp
from dvr_web.routes.reed_switch import reed_switch_bp
from dvr_web.utils import generate_nginx_configs, load_config, update_imei
from dvr_web.constants import VPN_CONFIG_PATH
from dvr_web.sockets import init_socketio

def create_app():
    """
    Створює та налаштовує екземпляр Flask додатку.
    """
    app = Flask(__name__)
    
    CORS(app, resources={r"/*": {"origins": "*"}})
    
    app.config['SECRET_KEY'] = 'mdvr-secret-key'
    app.config['JSON_AS_ASCII'] = False
    app.config['CORS_HEADERS'] = 'Content-Type'
    
    app.config['SOCKETIO_CORS_ALLOWED_ORIGINS'] = '*'
    app.config['SOCKETIO_ASYNC_MODE'] = 'threading'
    
    app.register_blueprint(web_bp)
    app.register_blueprint(api_bp, url_prefix='/api')
    app.register_blueprint(reed_switch_bp, url_prefix='/reed-switch')
    
    @app.route('/')
    def index():
        try:
            update_imei()
            
            config = load_config()
            camera_list = config.get('camera_list', [])
            
            vpn_config = ""
            try:
                if os.path.exists(VPN_CONFIG_PATH):
                    with open(VPN_CONFIG_PATH, 'r') as f:
                        vpn_config = f.read()
            except Exception as e:
                print(f"Error reading VPN config: {str(e)}")
            
            if camera_list:
                if not generate_nginx_configs(camera_list):
                    print("Warning: Failed to generate Nginx configs")
            
            return render_template('index.html',
                                vpn_config=vpn_config,
                                camera_list=config.get('camera_list', []),
                                program_options=config.get('program_options', {}),
                                rtsp_options=config.get('rtsp_options', {}),
                                video_options=config.get('video_options', {}),
                                ftp=config.get('ftp', {}),
                                photo_timeout=config.get('photo_timeout', 10)
                                )
        except Exception as e:
            print(f"Critical error in index route: {str(e)}")
            return render_template('index.html',
                                vpn_config="",
                                camera_list=[],
                                program_options={},
                                rtsp_options={},
                                video_options={},
                                ftp={},
                                photo_timeout=10,
                                error_message=f"Error loading configuration: {str(e)}"
                                )
        
    return app


def start_server(debug=False, host='0.0.0.0', port=8080):
    app = create_app()
    
    socketio = init_socketio(app)
    
    start_cpu_monitoring()
    
    socketio.run(app, debug=debug, host=host, port=port, allow_unsafe_werkzeug=True)

if __name__ == '__main__':
    start_server(host='0.0.0.0', port=80)
