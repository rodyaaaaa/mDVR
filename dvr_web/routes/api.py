import psutil
import subprocess

from flask import Blueprint, jsonify, request
from utils import *
from dvr_video.data.utils import get_config_path
from reed_switch, web import *
import json

api_bp = Blueprint('api', __name__)

cpu_load_history = []
    

@api_bp.route('/ext5v-v')
def api_ext5v_v():
    try:
        result = subprocess.run(['vcgencmd', 'pmic_read_adc'], capture_output=True, text=True, check=True)
        for line in result.stdout.splitlines():
            if 'EXT5V_V' in line:
                return jsonify({'value': line.strip()})
        return jsonify({'value': None})
    except Exception as e:
        return jsonify({'value': f'Error: {e}'})
    

@api_bp.route('/cpu-load')
def api_cpu_load():
    if not psutil:
        return jsonify({'error': 'psutil not installed'}), 500
    return jsonify({'history': cpu_load_history[-60:]})


@api_bp.route('/mem-usage')
def api_mem_usage():
    if not psutil:
        return jsonify({'error': 'psutil not installed'}), 500
    mem = psutil.virtual_memory()
    return jsonify({
        'total': mem.total,
        'used': mem.used,
        'free': mem.available,
        'percent': mem.percent
    })


@api_bp.route('/disk-usage')
def api_disk_usage():
    if not psutil:
        return jsonify({'error': 'psutil not installed'}), 500
    disk = psutil.disk_usage('/')
    return jsonify({
        'total': disk.total,
        'used': disk.used,
        'free': disk.free,
        'percent': disk.percent
    })
