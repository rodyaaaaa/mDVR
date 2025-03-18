import os
import re
import shutil
import json

from datetime import timedelta
from flask import Flask, request, jsonify, render_template
from pathlib import Path

CONFIG_FILE = 'data_config.json'
CONFIG_PATH = '/opt/mdvr/dvr_video'
CONFIG_FULL_PATH = os.path.join(CONFIG_PATH, CONFIG_FILE)
DEFAULT_CONFIG_PATH = os.path.join(CONFIG_PATH, 'default.json')
SERVICE_PATH = "/etc/systemd/system/mdvr.service"
VPN_CONFIG_PATH = "/etc/wireguard/wg0.conf"
REGULAR_SEARCH_IP = r"\b(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}\b"
NGINX_CONF_DIR = "/etc/nginx/sites-enabled"
BASE_PORT = 10511


app = Flask(__name__)


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
        os.system("systemctl restart mdvr")
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
        os.system('systemctl enable nginx')
        os.system('systemctl reload nginx')
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

        os.system("systemctl restart mdvr")
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

        os.system("systemctl restart mdvr")
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

        os.system("systemctl restart mdvr")
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


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=80)
