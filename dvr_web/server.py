import os
import shutil
from datetime import timedelta
from flask import Flask, request, jsonify, render_template
import json

CONFIG_FILE = 'data_config.json'
CONFIG_PATH = '/opt/mdvr/dvr_video'
CONFIG_FULL_PATH = os.path.join(CONFIG_PATH, CONFIG_FILE)
DEFAULT_CONFIG_PATH = os.path.join(CONFIG_PATH, 'default.json')
SERVICE_PATH = "/etc/systemd/system/mdvr.service"
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
        os.system("systemctl restart mdvr")
        return {"success": True, "message": "WatchdogSec updated successfully"}
    except Exception as e:
        return {"success": False, "error": str(e)}


app = Flask(__name__)


def load_config():
    if not os.path.exists(CONFIG_FULL_PATH):
        shutil.copyfile(DEFAULT_CONFIG_PATH, CONFIG_FULL_PATH)

    with open(CONFIG_FULL_PATH, 'r') as file:
        config = json.load(file)
        # Backward compatibility for old configs
        if "rtsp_options" not in config:
            config["rtsp_options"] = {
                "rtsp_transport": config.get("video_options", {}).get("rtsp_transport", "tcp"),
                "rtsp_resolution_x": config.get("video_options", {}).get("video_resolution_x", 640),
                "rtsp_resolution_y": config.get("video_options", {}).get("video_resolution_y", 480)
            }
        return config


@app.route('/')
def index():
    config = load_config()
    # Убрать преобразование в словарь. camera_list теперь список!
    return render_template('index.html',
                           camera_list=config['camera_list'],
                           rtsp_options=config['rtsp_options'],
                           video_options=config['video_options'],
                           ftp=config['ftp']
                           )


@app.route('/save-video-links', methods=['POST'])
def save_video_links():
    data = request.get_json()
    try:
        config = load_config()
        config['camera_list'] = data.get('camera_list', [])

        with open(CONFIG_FULL_PATH, 'w') as file:
            json.dump(config, file, indent=4)

        os.system("systemctl restart mdvr")
        return jsonify({"success": True, "message": "Video links saved successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/save-ftp-config', methods=['POST'])
def save_ftp_config():
    data = request.get_json()
    try:
        config = load_config()

        # Отримуємо дані з об'єкту 'ftp' з клієнта
        ftp_data = data.get('ftp', {})
        config['ftp'] = {
            "server": ftp_data.get('server', ''),
            "port": ftp_data.get('port', 21),
            "user": ftp_data.get('user', ''),
            "password": ftp_data.get('password', ''),
            "car_name": ftp_data.get('car_name', '')  # Тепер правильно
        }

        # Зберігаємо оновлену конфігурацію
        with open(CONFIG_FULL_PATH, 'w') as file:
            json.dump(config, file, indent=4)

        return jsonify({"success": True, "message": "Налаштування FTP збережено!"})
    except Exception as e:
        return jsonify({"success": False, "error": f"Помилка: {str(e)}"}), 500


@app.route('/save-video-options', methods=['POST'])
def save_video_options():
    data = request.get_json()
    try:
        config = load_config()

        # Оновлення RTSP параметрів
        config['rtsp_options'] = {
            "rtsp_transport": data.get('rtsp_transport', 'tcp'),
            "rtsp_resolution_x": data.get('rtsp_resolution_x', 640),
            "rtsp_resolution_y": data.get('rtsp_resolution_y', 480)
        }

        # Отримання та очищення введеного часу
        video_duration = data.get('video_duration', '00:02:00').strip().lower()

        # Видалення всіх нецифрових символів, крім двокрапки
        cleaned_duration = ''.join([c for c in video_duration if c.isdigit() or c == ':'])

        # Якщо є двокрапка - перевірити формат HH:MM:SS
        if ':' in cleaned_duration:
            parts = cleaned_duration.split(':')
            if len(parts) != 3:
                raise ValueError("Невірний формат. Використовуйте HH:MM:SS або хвилини (напр. '10 хв')")
            h, m, s = map(int, parts)
        else:
            # Інтерпретувати як хвилини
            try:
                minutes = int(cleaned_duration)
                h = minutes // 60
                m = minutes % 60
                s = 0
            except ValueError:
                raise ValueError("Невірний формат хвилин. Наприклад: '10' або '10 хв'")

        # Перевірка коректності значень
        if m > 59 or s > 59:
            raise ValueError("Невірні значення хвилин/секунд (мають бути ≤ 59)")

        # Форматування у HH:MM:SS
        formatted_duration = f"{h:02d}:{m:02d}:{s:02d}"

        # Оновлення конфіга
        config['video_options']['video_duration'] = formatted_duration
        config['video_options']['fps'] = data.get('fps', 15)

        # Оновлення Watchdog
        seconds = timedelta(hours=h, minutes=m, seconds=s).total_seconds()
        update_watchdog(int(seconds * 10))

        # Збереження
        with open(CONFIG_FULL_PATH, 'w') as file:
            json.dump(config, file, indent=4)

        os.system("systemctl restart mdvr")
        return jsonify({"success": True, "message": "Налаштування збережено!"})

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


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=80)
