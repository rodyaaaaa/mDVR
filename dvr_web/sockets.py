import time
import threading
import datetime

from flask_socketio import SocketIO, emit

from dvr_web.routes.reed_switch import read_reed_switch_state, stop_reed_switch
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
    start_time = time.time()

    while reed_switch_monitor_active:
        print(reed_switch_monitor_active)
        current_time = time.time()
        elapsed = current_time - start_time
        if elapsed >= REED_SWITCH_AUTOSTOP_SECONDS:
            print(f"Таймаут {REED_SWITCH_AUTOSTOP_SECONDS} с сплив — зупинка моніторингу")
            socketio.emit('disconnect', namespace='/ws')
            reed_switch_monitor_active = False
            stop_reed_switch()
            break
    
        current_state = read_reed_switch_state()
        reed_switch_state = {"status": current_state}
        print("current_time", current_time)

        if current_state != prev_state:
            socketio.emit('reed_switch_update', reed_switch_state, namespace='/ws')
            prev_state = current_state
            start_time = time.time()

        time.sleep(0.01)
    