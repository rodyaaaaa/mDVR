import os

DEFAULT_CONFIG_PATH = os.path.join(os.path.dirname(__file__), '../dvr_video/default.json')
SERVICE_PATH = "/etc/systemd/system/mdvr.service"
VPN_CONFIG_PATH = "/etc/wireguard/wg0.conf"
REGULAR_SEARCH_IP = r"\b(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}\b"
NGINX_CONF_DIR = "/etc/nginx/sites-enabled"
BASE_PORT = 10511
REED_SWITCH_PIN = 17
REED_SWITCH_AUTOSTOP_SECONDS = 180

# Reed Switch (геркони) GPIO pins
BTN_A_PIN = 22
BTN_B_PIN = 23
DOOR_SENSOR_PIN = 24

# Configuration constants
CONFIG_FILENAME = 'data_config.json'
 
# Path to recorded materials (videos)
MATERIALS_DIR = "/etc/mdvr/materials/"
