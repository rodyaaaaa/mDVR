import os
import shutil
from datetime import timedelta

from flask import Flask, request, jsonify, render_template
import json

CONFIG_FILE = 'data_config.json'
CONFIG_PATH = '/opt/dvr/dvr_video'
# CONFIG_PATH = '/home/vms/PycharmProjects/dvr_video'
CONFIG_FULL_PATH = os.path.join(CONFIG_PATH, CONFIG_FILE)
DEFAULT_CONFIG_PATH = os.path.join(CONFIG_PATH, 'default.json')
SERVICE_PATH = "/etc/systemd/system/dvr.service"

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

@app.route('/')
def index():
    if not os.path.exists(CONFIG_FULL_PATH):
        shutil.copyfile(DEFAULT_CONFIG_PATH, CONFIG_FULL_PATH)
    with open(CONFIG_FULL_PATH, 'r') as file:
        data = json.load(file)
    data['camera_list'] = {f'cam{i}': value for i, value in enumerate(data['camera_list'])}
    print(data)
    return render_template('index.html', **data)

@app.route('/save-config', methods=['POST'])
def save_config():
    if not os.path.exists(CONFIG_FULL_PATH):
        shutil.copyfile(DEFAULT_CONFIG_PATH, CONFIG_FULL_PATH)

    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "No data received"}), 400

    try:
        with open(CONFIG_FULL_PATH, 'w') as file:
            json.dump(data, file, indent=4)
        time = data['video_options']['time']
        h, m, s = map(int, time.split(":"))
        seconds = timedelta(hours=h, minutes=m, seconds=s).total_seconds()
        print(int(seconds))  # Виведе: 150
        new_watchdog_value = int(seconds * 3)  # Нове значення для WatchdogSec
        result = update_watchdog(new_watchdog_value)
        print(result)
        os.system("systemctl restart dvr")
        return jsonify({"success": True})
    except Exception as e:
        os.system("systemctl restart dvr")
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=80)
