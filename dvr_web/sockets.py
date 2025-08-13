import time
import threading
import os
import pty
import select
import signal
import crypt
import spwd

from flask_socketio import SocketIO, emit
from flask import request

from dvr_web.utils import load_config, read_reed_switch_state
from dvr_web.constants import REED_SWITCH_AUTOSTOP_SECONDS
from dvr_web.reed_switch_interface import RSFactory

socketio = None
reed_switch_monitor_active = False
term_sessions = {}

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

    # Terminal namespace: '/term'
    @socketio.on('connect', namespace='/term')
    def term_connect():
        # No-op; client will send term_open with credentials
        emit('term_status', {"status": "connected"}, namespace='/term')

    @socketio.on('term_open', namespace='/term')
    def term_open(data):
        # data: { username, password }
        sid = request.sid
        username = (data or {}).get('username') or ''
        password = (data or {}).get('password') or ''

        # Clean any existing session
        _close_term_session(sid)

        # Authenticate using shadow (since app runs as root, PAM prompt won't trigger for su)
        try:
            try:
                spw = spwd.getspnam(username)
            except KeyError:
                emit('term_error', {"error": "auth_failed"}, namespace='/term', to=sid)
                return
            hashed = spw.sp_pwdp or ''
            # Locked or disabled accounts often have '!' or '*' at start
            if not hashed or hashed[0] in ('!', '*'):
                emit('term_error', {"error": "auth_failed"}, namespace='/term', to=sid)
                return
            if crypt.crypt(password, hashed) != hashed:
                emit('term_error', {"error": "auth_failed"}, namespace='/term', to=sid)
                return

            # Fork a PTY and run su - <user> -s /bin/bash
            pid, fd = pty.fork()
            if pid == 0:
                # Child
                # Exec su to switch user and start bash as login shell
                os.execvp('su', ['su', '-', username, '-s', '/bin/bash'])
            else:
                # Parent: save session
                term_sessions[sid] = { 'pid': pid, 'fd': fd }

                # Start reader thread to stream output
                reader = threading.Thread(target=_term_reader, args=(sid,))
                reader.daemon = True
                reader.start()

                emit('term_status', {"status": "started"}, namespace='/term', to=sid)
        except Exception as e:
            emit('term_error', {"error": str(e)}, namespace='/term', to=sid)

    @socketio.on('term_input', namespace='/term')
    def term_input(data):
        sid = request.sid
        ch = (data or {}).get('data')
        sess = term_sessions.get(sid)
        if not sess:
            emit('term_error', {"error": "no_session"}, namespace='/term', to=sid)
            return
        if ch is None:
            return
        try:
            os.write(sess['fd'], ch.encode('utf-8', errors='ignore'))
        except Exception as e:
            emit('term_error', {"error": str(e)}, namespace='/term', to=sid)

    @socketio.on('disconnect', namespace='/term')
    def term_disconnect():
        sid = request.sid
        _close_term_session(sid)

    return socketio


def _term_reader(sid: str):
    sess = term_sessions.get(sid)
    if not sess:
        return
    fd = sess['fd']
    pid = sess['pid']
    try:
        while True:
            r, _, _ = select.select([fd], [], [], 0.5)
            if fd in r:
                try:
                    data = os.read(fd, 1024)
                except OSError:
                    break
                if not data:
                    break
                try:
                    socketio.emit('term_output', { 'data': data.decode('utf-8', errors='ignore') }, namespace='/term', to=sid)
                except Exception:
                    pass
            # Optionally, check if child is alive
            try:
                pid_ret, _ = os.waitpid(pid, os.WNOHANG)
                if pid_ret == pid:
                    break
            except ChildProcessError:
                break
    finally:
        socketio.emit('term_closed', {}, namespace='/term', to=sid)
        _close_term_session(sid)


def _close_term_session(sid: str):
    sess = term_sessions.pop(sid, None)
    if not sess:
        return
    try:
        try:
            os.kill(sess['pid'], signal.SIGHUP)
        except Exception:
            pass
        try:
            os.close(sess['fd'])
        except Exception:
            pass
    except Exception:
        pass


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
    