import time
import threading
from flask import request
from flask_socketio import SocketIO, emit
from dvr_web.utils import monitor_reed_switch, read_reed_switch_state

# Global variables
reed_switch_state = {
    "status": "unknown",
    "timestamp": int(time.time())
}

reed_switch_monitor_active = False
reed_switch_monitor_thread = None
reed_switch_initialized = False
reed_switch_autostop_time = None

socketio = None

def init_socketio(app):
    global socketio
    socketio = SocketIO(app, cors_allowed_origins="*")
    
    # Register event handlers
    @socketio.on('connect', namespace='/ws')
    def ws_connect(auth):
        global reed_switch_monitor_active, reed_switch_monitor_thread
        
        print(f"WebSocket клієнт підключився: {request.sid}")
        
        # Запускаємо моніторинг геркона, якщо він ще не запущений
        if not reed_switch_monitor_active:
            reed_switch_monitor_active = True
            reed_switch_monitor_thread = threading.Thread(target=monitor_reed_switch)
            reed_switch_monitor_thread.daemon = True
            reed_switch_monitor_thread.start()

    @socketio.on('disconnect', namespace='/ws')
    def ws_disconnect():
        print(f"WebSocket клієнт відключився: {request.sid}")
        
        # Перевіряємо, чи ще є підключені клієнти
        if not socketio.server.manager.rooms.get('/ws', {}):
            global reed_switch_monitor_active
            reed_switch_monitor_active = False

    @socketio.on('get_status', namespace='/ws')
    def ws_get_status():
        global reed_switch_state, reed_switch_initialized, reed_switch_autostop_time
        
        # Перевіряємо, чи геркон ініціалізовано
        if not reed_switch_initialized:
            emit('reed_switch_update', {
                "status": "unknown",
                "timestamp": int(time.time()),
                "initialized": False,
                "autostop": False,
                "seconds_left": 0
            })
            return
        
        # Оновлюємо поточний стан перед відправкою
        try:
            current_status = read_reed_switch_state()
            current_time = int(time.time())
            
            reed_switch_state = {
                "status": current_status,
                "timestamp": current_time
            }
        except Exception as e:
            print(f"Помилка при оновленні стану геркона: {str(e)}")
        
        # Додаємо інформацію про ініціалізацію
        response = reed_switch_state.copy()
        response["initialized"] = reed_switch_initialized
        
        # Додаємо інформацію про автоматичну зупинку
        if reed_switch_autostop_time:
            seconds_left = max(0, int(reed_switch_autostop_time - time.time()))
            response["autostop"] = True
            response["seconds_left"] = seconds_left
        else:
            response["autostop"] = False
            response["seconds_left"] = 0
        
        # Відправляємо поточний стан геркона клієнту, який запитав
        emit('reed_switch_update', response)

    return socketio
