import os
import shutil
import json
import re

from pathlib import Path

from dvr_web.constants import BASE_PORT, DEFAULT_CONFIG_PATH, NGINX_CONF_DIR, REGULAR_SEARCH_IP, SERVICE_PATH, VPN_CONFIG_PATH, CONFIG_FILENAME

def get_config_path():
    config_dir = '/etc/mdvr'
    os.makedirs(config_dir, exist_ok=True)
    return os.path.join(config_dir, CONFIG_FILENAME)

# Global variables for reed switch state
reed_switch_initialized = False
reed_switch_monitor_active = False
reed_switch_state = {"status": "unknown", "timestamp": 0}
reed_switch_autostop_time = None
global_reed_switch = None

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

    if os.path.getsize(config_path) == 0:
        print(f"Config file {config_path} is empty, copying default config")
        shutil.copyfile(DEFAULT_CONFIG_PATH, config_path)

    with open(config_path, 'r') as file:
        try:
            config = json.load(file)
        except json.JSONDecodeError as e:
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
            match = re.search(r"rtsp://(?:[^@]+@)?([0-9]{1,3}(?:\.[0-9]{1,3}){3})", rtsp_url)
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

        if 'ftp' in config and 'car_name' in config['ftp']:
            car_name = config['ftp']['car_name']

        if not car_name:
            car_name = "000"

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
