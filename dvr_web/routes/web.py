import json
import os

from flask import Blueprint, jsonify, request
from datetime import timedelta

from dvr_web.constants import VPN_CONFIG_PATH
from dvr_web.utils import generate_nginx_configs, get_camera_ports, load_config, restart_mdvr_engine, update_imei, update_watchdog, get_config_path


web_bp = Blueprint('web', __name__)


@web_bp.route('/get-camera-ports')
def get_camera_ports_route():
    return jsonify(get_camera_ports())


@web_bp.route('/get-imei')
def get_imei():
    try:
        config = load_config()
        return jsonify({"imei": config['program_options']['imei']})
    except Exception as e:
        return jsonify({"imei": "", "error": str(e)})


@web_bp.route('/get-service-status/<service_name>')
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


@web_bp.route('/save-write-mode', methods=['POST'])
def save_write_mode():
    data = request.get_json()
    try:
        config = load_config()
        config['program_options']['photo_mode'] = 0 if data.get('write_mode') == 'video' else 1

        with open(get_config_path(), 'w') as file:
            json.dump(config, file, indent=4)

        restart_mdvr_engine()

        return jsonify({"success": True, "message": "Write mode updated"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@web_bp.route('/save-rs-timeout', methods=['POST'])
def save_rs_timeout():
    data = request.get_json()
    try:
        value = data.get('rs_timeout', 0)
        config = load_config()
        print(config["reed_switch"]["rs_timeout"])
        config["reed_switch"]["rs_timeout"] = value
        with open(get_config_path(), 'w') as file:
            json.dump(config, file, indent=4)
        return jsonify({"success": True, "message": "RS Timeout saved"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@web_bp.route('/save-ftp-config', methods=['POST'])
def save_ftp_config():
    data = request.get_json()
    print(f"[DEBUG FTP] Received FTP config data: {data}")
    try:
        config = load_config()
        print(f"[DEBUG FTP] Loaded config: {config}")

        ftp_data = data.get('ftp', {})
        print(f"[DEBUG FTP] FTP data to save: {ftp_data}")
        config['ftp'] = {
            "server": ftp_data.get('server', ''),
            "port": ftp_data.get('port', 21),
            "user": ftp_data.get('user', ''),
            "password": ftp_data.get('password', ''),
            "car_name": ftp_data.get('car_name', '')
        }
        
        config_path = get_config_path()
        print(f"[DEBUG FTP] Saving to: {config_path}")
        print(f"[DEBUG FTP] Updated config: {config}")

        with open(config_path, 'w') as file:
            json.dump(config, file, indent=4)
        
        print(f"[DEBUG FTP] Config file saved successfully")
        update_imei()

        return jsonify({"success": True, "message": "FTP settings saved!"})
    except Exception as e:
        print(f"[DEBUG FTP] Error saving FTP config: {str(e)}")
        return jsonify({"success": False, "error": f"Error: {str(e)}"}), 500


@web_bp.route('/save-video-options', methods=['POST'])
def save_video_options():
    data = request.get_json()
    try:
        config = load_config()

        # Make sure size_folder_limit_gb is an integer with a default value
        try:
            config['program_options']['size_folder_limit_gb'] = int(data.get('size_folder_limit_gb', 10))
        except (TypeError, ValueError):
            config['program_options']['size_folder_limit_gb'] = 10

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
            
            # Make sure fps is an integer with a default value
            try:
                config['video_options']['fps'] = int(data.get('fps', 15))
            except (TypeError, ValueError):
                config['video_options']['fps'] = 15

            seconds = timedelta(hours=h, minutes=m, seconds=s).total_seconds()
            update_watchdog(int(seconds * 10))

        photo_timeout = data.get('photo_timeout')

        if photo_timeout:
            try:
                config['photo_timeout'] = int(photo_timeout)
                update_watchdog(int(int(photo_timeout) * 5))
            except (TypeError, ValueError):
                config['photo_timeout'] = 10
                update_watchdog(50)  # Default 10 * 5

        with open(get_config_path(), 'w') as file:
            json.dump(config, file, indent=4)

        restart_mdvr_engine()

        return jsonify({"success": True, "message": "Settings saved!"})

    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@web_bp.route('/save-vpn-config', methods=['POST'])
def save_vpn_config():
    data = request.get_json()
    if not data or 'vpn_config' not in data:
        return jsonify({"success": False, "error": "No config data received"}), 400

    try:
        with open(VPN_CONFIG_PATH, 'w') as file:
            file.write(data['vpn_config'])

        os.system("systemctl enable wg-quick@wg0")
        os.system("systemctl restart wg-quick@wg0")

        update_imei()

        return jsonify({"success": True, "message": "VPN config saved successfully"})
    except Exception as e:
        os.system("systemctl restart wg-quick@wg0")
        return jsonify({"success": False, "error": str(e)}), 500


@web_bp.route('/save-video-links', methods=['POST'])
def save_video_links():
    data = request.get_json()
    try:
        config = load_config()
        camera_list = data.get('camera_list', [])
        config['camera_list'] = camera_list

        with open(get_config_path(), 'w') as file:
            json.dump(config, file, indent=4)

        if not generate_nginx_configs(camera_list):
            raise Exception("Failed to generate Nginx configs")

        restart_mdvr_engine()

        return jsonify({"success": True, "message": "Video links saved successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
