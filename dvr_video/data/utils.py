import asyncio
import json
import os
import re
import shutil

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


async def move():
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
