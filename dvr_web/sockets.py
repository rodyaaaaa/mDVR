import time
import threading
from flask import request
from flask_socketio import SocketIO, emit
from dvr_web.routes.api import monitor_reed_switch, reed_switch_initialized, reed_switch_autostop_time, reed_switch_state

# Змінна для зберігання екземпляру SocketIO
socketio = None

def init_socketio(app):
    global socketio
    
    # Створюємо екземпляр SocketIO з покращеними налаштуваннями
    socketio = SocketIO(
        app, 
        cors_allowed_origins="*",
        async_mode='threading',
        logger=True,
        engineio_logger=True,
        ping_timeout=60,
        ping_interval=25
    )
    
    # Додаємо атрибути для стеження за станом геркона
    socketio.reed_switch_state = {
        "status": "unknown",
        "timestamp": int(time.time())
    }
    socketio.reed_switch_monitor_active = False
    socketio.reed_switch_initialized = False
    socketio.reed_switch_autostop_time = None
    
    print("[DEBUG SOCKET] Ініціалізація SocketIO завершена")
    
    # Register event handlers
    @socketio.on('connect', namespace='/ws')
    def ws_connect(auth):
        print(f"[DEBUG SOCKET] WebSocket клієнт підключився: {request.sid}")
        
        # Запускаємо моніторинг геркона, якщо він ще не запущений
        if not socketio.reed_switch_monitor_active:
            socketio.reed_switch_monitor_active = True
            reed_switch_monitor_thread = threading.Thread(target=monitor_reed_switch)
            reed_switch_monitor_thread.daemon = True
            reed_switch_monitor_thread.start()
            print("[DEBUG SOCKET] Запущено потік моніторингу геркона")
        
        # Відправляємо підтвердження підключення
        emit('connection_established', {"status": "connected", "time": int(time.time())})
        print("[DEBUG SOCKET] Відправлено повідомлення connection_established")

    @socketio.on('disconnect', namespace='/ws')
    def ws_disconnect():
        print(f"[DEBUG SOCKET] WebSocket клієнт відключився: {request.sid}")
        
        # Перевіряємо, чи ще є підключені клієнти
        if not socketio.server.manager.rooms.get('/ws', {}):
            socketio.reed_switch_monitor_active = False
            print("[DEBUG SOCKET] Зупинено моніторинг геркона - клієнтів немає")

    @socketio.on('get_status', namespace='/ws')
    def ws_get_status():
        # Перевіряємо, чи геркон ініціалізовано
        print(f"[DEBUG SOCKET] Отримано запит на статус геркона. reed_switch_initialized = {reed_switch_initialized}")
        
        # Гарантуємо, що ми повертаємо коректні дані незалежно від стану
        current_time = int(time.time())
        status_data = {
            "status": "unknown",
            "timestamp": current_time,
            "initialized": reed_switch_initialized,
            "autostop": False,
            "seconds_left": 0
        }
        
        if not reed_switch_initialized:
            print("[DEBUG SOCKET] Геркон не ініціалізовано, відправляємо unknown статус")
            emit('reed_switch_update', status_data)
            return
        
        # Оновлюємо поточний стан перед відправкою
        try:
            # Копіюємо дані з глобального стану
            if reed_switch_state and "status" in reed_switch_state:
                status_data["status"] = reed_switch_state["status"]
            if reed_switch_state and "timestamp" in reed_switch_state:
                status_data["timestamp"] = reed_switch_state["timestamp"]
            
            # Перевіряємо та нормалізуємо статус, щоб гарантувати правильні стани
            if status_data["status"] not in ["closed", "opened", "unknown"]:
                # Якщо отримано неправильний статус, виконуємо корекцію
                if status_data["status"] == "open":
                    status_data["status"] = "opened"
                else:
                    status_data["status"] = "unknown"
            
            # Додаємо інформацію про автоматичну зупинку
            if reed_switch_autostop_time:
                seconds_left = max(0, int(reed_switch_autostop_time - time.time()))
                status_data["autostop"] = True
                status_data["seconds_left"] = seconds_left
            
            # Відправляємо поточний стан геркона клієнту, який запитав
            print(f"[DEBUG SOCKET] Відправляємо відповідь: {status_data}")
            emit('reed_switch_update', status_data)
        except Exception as e:
            print(f"[DEBUG SOCKET] Помилка при оновленні стану геркона: {str(e)}")
            emit('reed_switch_update', {
                "status": "unknown",
                "timestamp": current_time,
                "initialized": reed_switch_initialized, 
                "autostop": False,
                "seconds_left": 0,
                "error": str(e)
            })

    return socketio
