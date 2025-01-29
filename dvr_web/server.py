import os
import shutil
from datetime import timedelta
from flask import Flask, request, jsonify, render_template
import json

CONFIG_FILE = 'data_config.json'
CONFIG_PATH = '/opt/dvr/dvr_video'
CONFIG_FULL_PATH = os.path.join(CONFIG_PATH, CONFIG_FILE)
DEFAULT_CONFIG_PATH = os.path.join(CONFIG_PATH, 'default.json')
SERVICE_PATH = "/etc/systemd/system/dvr.service"
VPN_CONFIG_PATH = "/etc/wireguard/wg0.conf"


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
        os.system("systemctl restart dvr")
        return {"success": True, "message": "WatchdogSec updated successfully"}
    except Exception as e:
        return {"success": False, "error": str(e)}


app = Flask(__name__)


def load_config():
    """Завантажує конфігурацію з data_config.json або default.json, якщо data_config.json не існує."""
    if not os.path.exists(CONFIG_FULL_PATH):
        shutil.copyfile(DEFAULT_CONFIG_PATH, CONFIG_FULL_PATH)

    with open(CONFIG_FULL_PATH, 'r') as file:
        return json.load(file)


@app.route('/')
def index():
    # Завантажуємо конфігурацію
    config = load_config()

    # Перетворюємо список камер у словник для зручності відображення на фронтенді
    config['camera_list'] = {f'Cam {i + 1}': value for i, value in enumerate(config['camera_list'])}

    # Відображаємо сторінку з конфігурацією
    return render_template('index.html', **config)


@app.route('/save-video-links', methods=['POST'])
def save_video_links():
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "No data received"}), 400

    try:
        # Завантажуємо поточну конфігурацію
        config = load_config()

        # Оновлюємо лише список камер
        config['camera_list'] = data.get('camera_list', [])

        # Зберігаємо оновлену конфігурацію
        with open(CONFIG_FULL_PATH, 'w') as file:
            json.dump(config, file, indent=4)

        os.system("systemctl restart dvr")

        return jsonify({"success": True, "message": "Video links saved successfully"})
    except Exception as e:
        os.system("systemctl restart dvr")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/save-ftp-config', methods=['POST'])
def save_ftp_config():
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "No data received"}), 400

    try:
        # Завантажуємо поточну конфігурацію
        config = load_config()

        # Оновлюємо FTP-налаштування та car_name
        config['ftp'] = data.get('ftp', {})
        config['car_name'] = data.get('car_name', '')

        # Зберігаємо оновлену конфігурацію
        with open(CONFIG_FULL_PATH, 'w') as file:
            json.dump(config, file, indent=4)

        os.system("systemctl restart dvr")

        return jsonify({"success": True, "message": "FTP configuration and car name saved successfully"})
    except Exception as e:
        os.system("systemctl restart dvr")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/save-video-options', methods=['POST'])
def save_video_options():
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "No data received"}), 400

    try:
        # Завантажуємо поточну конфігурацію
        config = load_config()

        # Оновлюємо video_options
        config['video_options'] = data.get('video_options', {})

        # Зберігаємо оновлену конфігурацію
        with open(CONFIG_FULL_PATH, 'w') as file:
            json.dump(config, file, indent=4)

        # Оновлюємо WatchdogSec на основі нового часу
        time = config['video_options']['time']
        h, m, s = map(int, time.split(":"))
        seconds = timedelta(hours=h, minutes=m, seconds=s).total_seconds()
        new_watchdog_value = int(seconds * 10)  # Нове значення для WatchdogSec
        result = update_watchdog(new_watchdog_value)
        print(result)

        os.system("systemctl restart dvr")

        return jsonify({"success": True, "message": "Video options saved successfully"})
    except Exception as e:
        os.system("systemctl restart dvr")
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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8005)