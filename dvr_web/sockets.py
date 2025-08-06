import time
import threading
import datetime

from flask_socketio import SocketIO, emit

from dvr_web.routes.reed_switch import read_reed_switch_state
from dvr_web.constants import REED_SWITCH_AUTOSTOP_SECONDS

socketio = None
reed_switch_monitor_active = False
reed_switch_state = None

def init_socketio(app):
    global socketio

    socketio = SocketIO(
        app,
        cors_allowed_origins="*",
        async_mode='threading',
        logger=True,
        engineio_logger=True,
        ping_timeout=60,
        ping_interval=25
    )

    @socketio.on('connect', namespace='/ws')
    def ws_connect(auth):
        global reed_switch_monitor_active

        reed_switch_monitor_thread = threading.Thread(target=monitor_reed_switch)
        reed_switch_monitor_thread.daemon = True
        reed_switch_monitor_thread.start()

        emit('connection_established', {"status": "connected", "time": int(time.time())})

    @socketio.on('disconnect', namespace='/ws')
    def ws_disconnect():
        global reed_switch_monitor_active
        reed_switch_monitor_active = False

    @socketio.on('get_status', namespace='/ws')
    def ws_get_status():
        current_time = int(time.time())
        status_data = {
            "status": "unknown",
            "timestamp": current_time,
            "initialized": True,
            "autostop": False,
            "seconds_left": 0
        }

        if reed_switch_state and "status" in reed_switch_state:
            status_data["status"] = reed_switch_state["status"]
        if reed_switch_state and "timestamp" in reed_switch_state:
            status_data["timestamp"] = reed_switch_state["timestamp"]

        if status_data["status"] not in ["closed", "opened", "unknown"]:
            if status_data["status"] == "open":
                status_data["status"] = "opened"
            else:
                status_data["status"] = "unknown"

        print(f"[DEBUG SOCKET] Відправляємо відповідь: {status_data}")
        emit('reed_switch_update', status_data)

    return socketio


def monitor_reed_switch():
    global reed_switch_monitor_active, reed_switch_state, socketio
    reed_switch_monitor_active = True

    while reed_switch_monitor_active:
        print(reed_switch_monitor_active)
        current_time = time.time()
        current_state = read_reed_switch_state()

        timestamp = int(current_time)
        reed_switch_state = {
            "status": current_state,
            "timestamp": timestamp
        }

        status_with_init = reed_switch_state.copy()

        seconds_left = datetime.datetime.now() - datetime.timedelta(seconds=REED_SWITCH_AUTOSTOP_SECONDS)
        print("SECONDS LEFT BEFORE", seconds_left)
        seconds_left = seconds_left.timestamp()
        status_with_init["autostop"] = True
        print("current_time", current_time)
        print("SECONDS LEFT", seconds_left)
        status_with_init["seconds_left"] = max(0, seconds_left)

        socketio.emit('reed_switch_update', status_with_init, namespace='/ws')

        time.sleep(0.01)
    