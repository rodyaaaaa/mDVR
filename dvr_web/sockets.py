import time
import threading

from flask_socketio import SocketIO, emit

from dvr_web.utils import load_config, read_reed_switch_state
from dvr_web.constants import REED_SWITCH_AUTOSTOP_SECONDS
from dvr_web.reed_switch_interface import RSFactory

socketio = None
reed_switch_monitor_active = False

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

        config = load_config()
        impulse=config["reed_switch"]["impulse"]

        reed_switch_monitor_thread = threading.Thread(target=monitor_reed_switch, args=(impulse,))
        reed_switch_monitor_thread.daemon = True
        reed_switch_monitor_thread.start()

        emit('connection_established', {"status": "connected", "time": int(time.time())})

    @socketio.on('disconnect', namespace='/ws')
    def ws_disconnect():
        global reed_switch_monitor_active
        reed_switch_monitor_active = False

    return socketio


def monitor_reed_switch(impulse):
    global reed_switch_monitor_active, socketio
    
    reed_switch_object = RSFactory.create(bool(impulse))
    reed_switch_object.setup()
    
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
            break
    
        current_state = read_reed_switch_state(reed_switch_object)
        reed_switch_state = {"status": current_state}
        print("current_time", current_time)

        if current_state != prev_state:
            socketio.emit('reed_switch_update', reed_switch_state, namespace='/ws')
            prev_state = current_state
            start_time = time.time()

        time.sleep(0.01)

    reed_switch_object.clean()
    