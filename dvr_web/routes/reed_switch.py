# REST API для отримання поточного стану геркона
@api_bp.route('/reed-switch-status')
def api_reed_switch_status():
    global reed_switch_state, reed_switch_initialized, reed_switch_autostop_time
    
    if not reed_switch_initialized:
        return jsonify({
            "status": "unknown",
            "timestamp": int(time.time()),
            "initialized": False,
            "autostop": False,
            "seconds_left": 0
        })
    
    try:
        current_status = read_reed_switch_state()
        current_time = int(time.time())
        
        reed_switch_state = {
            "status": current_status,
            "timestamp": current_time
        }
    except Exception as e:
        print(f"Помилка при оновленні стану геркона через API: {str(e)}")
    
    response = reed_switch_state.copy()
    response["initialized"] = reed_switch_initialized
    
    if reed_switch_autostop_time:
        seconds_left = max(0, int(reed_switch_autostop_time - time.time()))
        response["autostop"] = True
        response["seconds_left"] = seconds_left
    else:
        response["autostop"] = False
        response["seconds_left"] = 0
    
    return jsonify(response)


# Новий API маршрут для ініціалізації геркона
@api_bp.route('/initialize-reed-switch', methods=['POST'])
def api_initialize_reed_switch():
    global reed_switch_initialized, reed_switch_autostop_time
    
    rs_status = check_reed_switch_status()
    if rs_status:
        error_msg = "Помилка: Перемикач Reed Switch в налаштуваннях повинен бути у положенні OFF перед ініціалізацією геркона"
        print(error_msg)
        return jsonify({
            "success": False, 
            "error": error_msg,
            "reed_switch_enabled": True
        })
    
    if reed_switch_initialized:
        try:
            GPIO.cleanup(REED_SWITCH_PIN)
        except Exception as e:
            print(f"Помилка при очищенні GPIO: {str(e)}")
    
    reed_switch_autostop_time = None
    
    result = initialize_reed_switch()
    
    if result["success"] and reed_switch_autostop_time:
        result["autostop"] = True
        result["seconds_left"] = REED_SWITCH_AUTOSTOP_SECONDS
    else:
        result["autostop"] = False
        result["seconds_left"] = 0
    
    return jsonify(result)


# Новий API маршрут для зупинки моніторингу геркона
@api_bp.route('/stop-reed-switch', methods=['POST'])
def api_stop_reed_switch():
    global reed_switch_initialized, reed_switch_monitor_active, reed_switch_autostop_time
    
    try:
        reed_switch_monitor_active = False
        
        reed_switch_autostop_time = None
        
        if reed_switch_initialized:
            GPIO.cleanup(REED_SWITCH_PIN)
            reed_switch_initialized = False
        
        return jsonify({"success": True, "message": "Моніторинг геркона зупинено"})
    except Exception as e:
        error_msg = f"Помилка при зупинці моніторингу геркона: {str(e)}"
        print(error_msg)
        return jsonify({"success": False, "error": error_msg})


@api_bp.route('/get-reed-switch-status')
def get_reed_switch_status():
    try:
        output = os.popen("systemctl is-enabled mdvr_rs.timer").read().strip()
        state = "on" if output == "enabled" else "off"
        return jsonify({"state": state})
    except Exception as e:
        return jsonify({"state": "off", "error": str(e)})


@api_bp.route('/toggle-reed-switch', methods=['POST'])
def toggle_reed_switch():
    data = request.get_json()
    state = data.get("reed_switch", "off")
    try:
        if state == "on":
            os.system("systemctl stop mdvr.service")
            os.system("systemctl disable mdvr.timer")
            os.system("systemctl stop mdvr.timer")
            os.system("systemctl enable mdvr_rs.timer")
            os.system("systemctl start mdvr_rs.timer")
        else:
            os.system("systemctl stop mdvr_rs.service")
            os.system("systemctl disable mdvr_rs.timer")
            os.system("systemctl stop mdvr_rs.timer")
            os.system("systemctl enable mdvr.timer")
            os.system("systemctl start mdvr.timer")
        return jsonify({"success": True, "message": "Reed Switch toggled successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
        