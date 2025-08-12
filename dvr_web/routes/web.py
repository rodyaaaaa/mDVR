import json
import os
import subprocess

from flask import Blueprint, jsonify, request, send_from_directory
from datetime import timedelta, datetime

from dvr_web.constants import VPN_CONFIG_PATH, MATERIALS_DIR
from dvr_web.utils import generate_nginx_configs, get_camera_ports, load_config, restart_mdvr_engine, update_imei, update_watchdog, get_config_path


web_bp = Blueprint('web', __name__)


@web_bp.route('/get-camera-ports')
def get_camera_ports_route():
    return jsonify(get_camera_ports())


@web_bp.route('/get-imei')
def get_imei():
    try:
        config = load_config()
        return jsonify({"imei": config['program_options']['imei']})
    except Exception as e:
        return jsonify({"imei": "", "error": str(e)})


@web_bp.route('/get-service-status/<service_name>')
def get_service_status(service_name):
    try:
        status = os.popen(f"systemctl is-active {service_name}").read().strip()
        enabled = os.popen(f"systemctl is-enabled {service_name}").read().strip()
        description = os.popen(f"systemctl show {service_name} --property=Description --value").read().strip()
        return jsonify({
            "status": status,
            "enabled": enabled == "enabled",
            "description": description
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@web_bp.route('/get-network-info')
def get_network_info():
    """Return network info: interfaces and IP addresses.
    Uses `ip -j addr` if available. Falls back to `hostname -I` on error.
    """
    try:
        # Try JSON output from iproute2
        raw = subprocess.check_output(["ip", "-j", "addr"], text=True)
        arr = json.loads(raw)
        interfaces = []
        for itf in arr:
            # Skip loopback interface
            if (itf.get('ifname') or '').lower() == 'lo':
                continue
            addrs = []
            for ai in itf.get('addr_info', []):
                addrs.append({
                    'family': ai.get('family'),
                    'local': ai.get('local'),
                    'prefixlen': ai.get('prefixlen'),
                    'scope': ai.get('scope')
                })
            interfaces.append({
                'name': itf.get('ifname'),
                'index': itf.get('ifindex'),
                'mtu': itf.get('mtu'),
                'state': itf.get('operstate'),
                'mac': itf.get('address'),
                'addresses': addrs
            })

        # Quick summary of IPv4 addresses
        ipv4_list = []
        for itf in interfaces:
            for a in itf['addresses']:
                if a.get('family') == 'inet' and a.get('local'):
                    ipv4_list.append(a['local'])

        return jsonify({
            'interfaces': interfaces,
            'ipv4': ipv4_list
        })
    except Exception as e:
        try:
            ips = subprocess.check_output(["hostname", "-I"], text=True).strip()
        except Exception:
            ips = ""
        return jsonify({
            'interfaces': [],
            'ipv4': [ip for ip in ips.split() if ip],
            'error': str(e)
        })


@web_bp.route('/get-iptables-rules')
def get_iptables_rules():
    """Return only raw filter rules from iptables (-S)."""
    try:
        output = subprocess.check_output(["iptables", "-S"], text=True, stderr=subprocess.STDOUT)
        return jsonify({
            "filter_rules": output.splitlines()
        })
    except subprocess.CalledProcessError as e:
        return jsonify({
            "filter_rules": [],
            "error": e.output.strip() or str(e)
        }), 500
    except Exception as e:
        return jsonify({
            "filter_rules": [],
            "error": str(e)
        }), 500


@web_bp.route('/get-service-logs/<service_name>')
def get_service_logs(service_name):
    """
    Return recent logs for a systemd unit using a simple offset-based pagination.
    Query params:
      - limit: number of lines to return (default 200, max 1000)
      - offset: how many most-recent lines to skip (default 0)
    """
    try:
        limit = int(request.args.get('limit', 200))
        offset = int(request.args.get('offset', 0))
        limit = max(1, min(limit, 1000))
        offset = max(0, offset)

        # Fetch offset+limit most recent lines, then slice the last `limit` lines
        total = offset + limit
        cmd = f"journalctl -u {service_name} -n {total} --no-pager -o short-iso"
        raw = os.popen(cmd).read()
        lines = [ln for ln in raw.splitlines() if ln.strip()]
        # Take the slice from the end accounting for offset and limit
        total_len = len(lines)
        end_idx = max(0, total_len - offset)
        start_idx = max(0, end_idx - limit)
        page = lines[start_idx:end_idx]

        return jsonify({
            "unit": service_name,
            "offset": offset,
            "limit": limit,
            "count": len(page),
            "next_offset": offset + len(page),
            "logs": page
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@web_bp.route('/save-write-mode', methods=['POST'])
def save_write_mode():
    data = request.get_json()
    try:
        config = load_config()
        config['program_options']['photo_mode'] = 0 if data.get('write_mode') == 'video' else 1

        with open(get_config_path(), 'w') as file:
            json.dump(config, file, indent=4)

        restart_mdvr_engine()

        return jsonify({"success": True, "message": "Write mode updated"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@web_bp.route('/save-rs-timeout', methods=['POST'])
def save_rs_timeout():
    data = request.get_json()
    try:
        value = data.get('rs_timeout', 0)
        config = load_config()
        print(config["reed_switch"]["rs_timeout"])
        config["reed_switch"]["rs_timeout"] = value
        with open(get_config_path(), 'w') as file:
            json.dump(config, file, indent=4)
        return jsonify({"success": True, "message": "RS Timeout saved"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@web_bp.route('/save-ftp-config', methods=['POST'])
def save_ftp_config():
    data = request.get_json()
    print(f"[DEBUG FTP] Received FTP config data: {data}")
    try:
        config = load_config()
        print(f"[DEBUG FTP] Loaded config: {config}")

        ftp_data = data.get('ftp', {})
        print(f"[DEBUG FTP] FTP data to save: {ftp_data}")
        config['ftp'] = {
            "server": ftp_data.get('server', ''),
            "port": ftp_data.get('port', 21),
            "user": ftp_data.get('user', ''),
            "password": ftp_data.get('password', ''),
            "car_name": ftp_data.get('car_name', '')
        }
        
        config_path = get_config_path()
        print(f"[DEBUG FTP] Saving to: {config_path}")
        print(f"[DEBUG FTP] Updated config: {config}")

        with open(config_path, 'w') as file:
            json.dump(config, file, indent=4)
        
        print(f"[DEBUG FTP] Config file saved successfully")
        update_imei()

        return jsonify({"success": True, "message": "FTP settings saved!"})
    except Exception as e:
        print(f"[DEBUG FTP] Error saving FTP config: {str(e)}")
        return jsonify({"success": False, "error": f"Error: {str(e)}"}), 500


@web_bp.route('/save-video-options', methods=['POST'])
def save_video_options():
    data = request.get_json()
    try:
        config = load_config()

        # Make sure size_folder_limit_gb is an integer with a default value
        try:
            config['program_options']['size_folder_limit_gb'] = int(data.get('size_folder_limit_gb', 10))
        except (TypeError, ValueError):
            config['program_options']['size_folder_limit_gb'] = 10

        config['rtsp_options'] = {
            "rtsp_transport": data.get('rtsp_transport', 'tcp'),
            "rtsp_resolution_x": data.get('rtsp_resolution_x', 640),
            "rtsp_resolution_y": data.get('rtsp_resolution_y', 480)
        }

        video_duration = data.get('video_duration')
        if video_duration:
            video_duration = video_duration.strip().lower()
            cleaned_duration = ''.join([c for c in video_duration if c.isdigit() or c == ':'])
            if ':' in cleaned_duration:
                parts = cleaned_duration.split(':')
                if len(parts) != 3:
                    raise ValueError("Incorrect format. Use HH:MM:SS or minutes (e.g., '10 min').")
                h, m, s = map(int, parts)
            else:
                try:
                    minutes = int(cleaned_duration)
                    h = minutes // 60
                    m = minutes % 60
                    s = 0
                except ValueError:
                    raise ValueError("Incorrect format for minutes. For example: '10' or '10 min'.")

            if m > 59 or s > 59:
                raise ValueError("Invalid minutes/seconds values (must be ≤ 59).")

            formatted_duration = f"{h:02d}:{m:02d}:{s:02d}"
            config['video_options']['video_duration'] = formatted_duration
            
            # Make sure fps is an integer with a default value
            try:
                config['video_options']['fps'] = int(data.get('fps', 15))
            except (TypeError, ValueError):
                config['video_options']['fps'] = 15

            seconds = timedelta(hours=h, minutes=m, seconds=s).total_seconds()
            update_watchdog(int(seconds * 10))

        photo_timeout = data.get('photo_timeout')

        if photo_timeout:
            try:
                config['photo_timeout'] = int(photo_timeout)
                update_watchdog(int(int(photo_timeout) * 5))
            except (TypeError, ValueError):
                config['photo_timeout'] = 10
                update_watchdog(50)  # Default 10 * 5

        with open(get_config_path(), 'w') as file:
            json.dump(config, file, indent=4)

        restart_mdvr_engine()

        return jsonify({"success": True, "message": "Settings saved!"})

    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@web_bp.route('/save-vpn-config', methods=['POST'])
def save_vpn_config():
    data = request.get_json()
    if not data or 'vpn_config' not in data:
        return jsonify({"success": False, "error": "No config data received"}), 400

    try:
        with open(VPN_CONFIG_PATH, 'w') as file:
            file.write(data['vpn_config'])

        os.system("systemctl enable wg-quick@wg0")
        os.system("systemctl restart wg-quick@wg0")

        update_imei()

        return jsonify({"success": True, "message": "VPN config saved successfully"})
    except Exception as e:
        os.system("systemctl restart wg-quick@wg0")
        return jsonify({"success": False, "error": str(e)}), 500


@web_bp.route('/save-video-links', methods=['POST'])
def save_video_links():
    data = request.get_json()
    try:
        config = load_config()
        camera_list = data.get('camera_list', [])
        config['camera_list'] = camera_list

        with open(get_config_path(), 'w') as file:
            json.dump(config, file, indent=4)

        if not generate_nginx_configs(camera_list):
            raise Exception("Failed to generate Nginx configs")

        restart_mdvr_engine()

        return jsonify({"success": True, "message": "Video links saved successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# Materials endpoints
@web_bp.route('/materials/list')
def list_materials():
    try:
        if not os.path.isdir(MATERIALS_DIR):
            return jsonify({"files": [], "message": f"Directory not found: {MATERIALS_DIR}"})

        # Parse optional date filters
        def parse_date(d: str | None):
            if not d:
                return None
            d = d.strip()
            for fmt in ("%Y-%m-%d", "%d.%m.%Y"):
                try:
                    return datetime.strptime(d, fmt)
                except ValueError:
                    continue
            return None

        date_from_raw = request.args.get('date_from')
        date_to_raw = request.args.get('date_to')
        date_from = parse_date(date_from_raw)
        date_to = parse_date(date_to_raw)
        if date_from:
            # start of day
            date_from = datetime(year=date_from.year, month=date_from.month, day=date_from.day, hour=0, minute=0, second=0)
        if date_to:
            # end of day
            date_to = datetime(year=date_to.year, month=date_to.month, day=date_to.day, hour=23, minute=59, second=59)

        video_exts = {'.mp4', '.mkv', '.avi', '.mov', '.m3u8', '.ts'}
        items = []
        for name in sorted(os.listdir(MATERIALS_DIR)):
            path = os.path.join(MATERIALS_DIR, name)
            if not os.path.isfile(path):
                continue
            ext = os.path.splitext(name)[1].lower()
            if ext not in video_exts:
                continue
            stat = os.stat(path)

            # Parse filename according to dvr_video convention: c + '24' + yymmdd + [hhmmss]
            base = os.path.splitext(name)[0]
            display_name = name
            cam = None
            date_str = None
            time_str = None
            recorded_dt = None
            try:
                if len(base) >= 9 and base[1:3] == '24':
                    cam = int(base[0])
                    yymmdd = base[3:9]
                    # Convert to DD.MM.YYYY
                    yy = int(yymmdd[0:2])
                    mm = int(yymmdd[2:4])
                    dd = int(yymmdd[4:6])
                    yyyy = 2000 + yy
                    date_str = f"{dd:02d}.{mm:02d}.{yyyy}"
                    if len(base) >= 15:
                        hh = int(base[9:11])
                        mi = int(base[11:13])
                        ss = int(base[13:15])
                        time_str = f"{hh:02d}:{mi:02d}:{ss:02d}"
                        recorded_dt = datetime(year=yyyy, month=mm, day=dd, hour=hh, minute=mi, second=ss)
                    else:
                        recorded_dt = datetime(year=yyyy, month=mm, day=dd, hour=0, minute=0, second=0)
                    if cam and date_str:
                        display_name = f"Камера {cam} — {date_str}" + (f" {time_str}" if time_str else "")
            except Exception:
                # Fallback to original name on any parsing error
                pass

            if recorded_dt is None:
                recorded_dt = datetime.fromtimestamp(int(stat.st_mtime))

            # Apply filters
            if date_from and recorded_dt < date_from:
                continue
            if date_to and recorded_dt > date_to:
                continue

            items.append({
                "name": name,
                "size": stat.st_size,
                "mtime": int(stat.st_mtime),
                "url": f"/materials/file/{name}",
                "display_name": display_name,
                "camera": cam,
                "recorded_date": date_str,
                "recorded_time": time_str,
                "recorded_ts": int(recorded_dt.timestamp())
            })
        return jsonify({"files": items})
    except Exception as e:
        return jsonify({"files": [], "error": str(e)}), 500


@web_bp.route('/materials/file/<path:filename>')
def get_material_file(filename):
    # Serve file directly from materials directory
    return send_from_directory(MATERIALS_DIR, filename, as_attachment=False)
