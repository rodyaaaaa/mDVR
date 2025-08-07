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

    return socketio


def monitor_reed_switch():
    global reed_switch_monitor_active, reed_switch_state, socketio
    reed_switch_monitor_active = True
    prev_state = None

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
        print("current_time", current_time)
        print("SECONDS LEFT", seconds_left)

        if current_state != prev_state:
            socketio.emit('reed_switch_update', status_with_init, namespace='/ws')
            prev_state = current_state

        time.sleep(0.01)
    