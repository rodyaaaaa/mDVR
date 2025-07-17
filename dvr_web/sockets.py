import time
import threading

from flask_socketio import SocketIO, emit

from dvr_web.routes.reed_switch import read_reed_switch_state, reed_switch_autostop_time

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

        if not socketio.server.manager.rooms.get('/ws', {}):
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

        if reed_switch_autostop_time:
            seconds_left = max(0, int(reed_switch_autostop_time - time.time()))
            status_data["autostop"] = True
            status_data["seconds_left"] = seconds_left

        print(f"[DEBUG SOCKET] Відправляємо відповідь: {status_data}")
        emit('reed_switch_update', status_data)

    return socketio


def monitor_reed_switch():
    global reed_switch_monitor_active, reed_switch_state
    reed_switch_monitor_active = True
    prev_state = None

    while reed_switch_monitor_active:
        current_time = time.time()
        current_state = read_reed_switch_state()

        if current_state != prev_state:
            time.sleep(0.05)
            current_state = read_reed_switch_state()

            if current_state != prev_state:
                timestamp = int(current_time)
                reed_switch_state = {
                    "status": current_state,
                    "timestamp": timestamp
                }

                status_with_init = reed_switch_state.copy()

                seconds_left = int(reed_switch_autostop_time - current_time) if reed_switch_autostop_time else 0
                status_with_init["autostop"] = reed_switch_autostop_time is not None
                status_with_init["seconds_left"] = max(0, seconds_left)

                emit('reed_switch_update', status_with_init, namespace='/ws')

                prev_state = current_state

        seconds_left = int(reed_switch_autostop_time - current_time) if reed_switch_autostop_time else 0
        update_interval = 1 if seconds_left <= 10 else 10

        if current_time - reed_switch_state.get("timestamp", 0) >= update_interval:
            status_with_init = reed_switch_state.copy()
            status_with_init["autostop"] = reed_switch_autostop_time is not None
            status_with_init["seconds_left"] = max(0, seconds_left)

            emit('reed_switch_update', status_with_init, namespace='/ws')

        time.sleep(0.01)
