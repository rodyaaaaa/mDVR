import asyncio
import json
import time
import os
import re
import shutil
import subprocess
import threading

from datetime import datetime
from typing import List

from .constants import CONFIG_FILENAME


def get_config_path():
    config_dir = '/etc/mdvr'
    os.makedirs(config_dir, exist_ok=True)
    return os.path.join(config_dir, CONFIG_FILENAME)


def read_config():
    config_path = get_config_path()
    if not os.path.exists(config_path):
        # Копіюємо дефолтний конфіг, якщо його ще немає
        default_path = os.path.join(os.path.dirname(__file__), '../default.json')
        shutil.copyfile(default_path, config_path)
    with open(config_path, 'r') as config_file:
        data = json.load(config_file)
    return data


async def get_date(video):
    # 224250109081232.mp4
    raw_date = video[:9]
    date = raw_date[3:]
    date = datetime.strptime(date, '%y%m%d')
    date = date.strftime('%d-%m-%Y')
    return date


def move():
    content = os.listdir("temp")

    for i in content:
        shutil.move(
            f"temp/{i}",
            f"/etc/mdvr/materials/{i}"
        )


def file_date_sort(file_list: List[str]) -> List[str]:
    return sorted(file_list, key=lambda x: x[3:-4])


def _find_files_with_extra_after_log(directory):
    result = []
    pattern = re.compile(r'\.log.+$', re.IGNORECASE)

    for root, dirs, files in os.walk(directory):
        for filename in files:
            if pattern.search(filename):
                result.append(filename)

    return result


def extract_date_from_filename(filename: str) -> str | None:
    pattern = re.compile(r'\.log\.(\d{4}-\d{2}-\d{2})')
    match = pattern.search(filename)
    if match:
        date = datetime.strptime(match.group(1), '%Y-%m-%d')
        date = date.strftime('%d-%m-%Y')
        return str(date)
    return None


async def find_files_with_extra_after_log(directory):
    return await asyncio.to_thread(_find_files_with_extra_after_log, directory)


async def extract_date_from_filename_async(filename: str) -> str | None:
    return await asyncio.to_thread(extract_date_from_filename, filename)


def generate_file_output_name(current_link: int, filename: str, file_extension: str) -> str:
    return f"temp/{current_link + 1}24{filename}{file_extension}"


def get_ext5v_v():
    try:
        result = subprocess.run(['vcgencmd', 'pmic_read_adc'], capture_output=True, text=True, check=True)
        for line in result.stdout.splitlines():
            if 'EXT5V_V' in line:
                return line.strip()
    except Exception as e:
        return f"Error: {e}"
    return None


def stop_ffmpeg(proc, logger, timeout: float = 5.0):
    """
    Correct process termination: SIGINT -> wait(timeout) -> SIGTERM -> wait -> SIGKILL.
    Returns returncode or None on error.
    """
    if proc is None:
        return None

    if proc.poll() is not None:
        return proc.returncode

    try:
        proc.send_signal(signal.SIGINT)
    except Exception:
        try:
            proc.terminate()
        except Exception:
            pass

    try:
        proc.wait(timeout=timeout)
        return proc.returncode
    except subprocess.TimeoutExpired:
        logger.warning("ffmpeg did not respond to SIGINT, sending SIGTERM.")
        try:
            proc.terminate()
        except Exception:
            pass
        try:
            proc.wait(timeout=timeout)
            return proc.returncode
        except subprocess.TimeoutExpired:
            logger.warning("ffmpeg did not terminate, sending SIGKILL.")
            try:
                proc.kill()
            except Exception:
                pass
            try:
                proc.wait()
            except Exception:
                pass
            return proc.returncode
    

def monitor_ffmpeg(proc, logger, camera_name: str, stop_event: threading.Event, max_restarts: int = 0):
    """
    Reads process stderr line by line, logs and raises errors in the logger.
    If the process has exited — returns. For simplicity, restarts are not performed by default (max_restarts=0). 
    If auto-restart is needed, max_restarts can be increased.
    """
    restarts = 0
    while not stop_event.is_set():
        if proc.poll() is not None:
            rc = proc.returncode
            if rc != 0 and rc != 255:
                logger.error(f"ffmpeg process ({camera_name}) exited with code {rc}")
            break

        if proc.stderr is None:
            time.sleep(0.1)
            continue

        raw = proc.stderr.readline()

        if not raw:
            time.sleep(0.05)
            continue

        line = raw.decode('utf-8', errors='replace').strip()
        logger.debug(f"[ffmpeg {camera_name}] {line}")
        lower = line.lower()
        if 'error' in lower or 'failed' in lower or 'connection timed out' in lower or 'server returned' in lower:
            logger.error(f"FFMPEG ERROR [{camera_name}]: {line}")
