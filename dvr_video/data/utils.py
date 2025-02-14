import asyncio
import json
import os
import re
import shutil

from datetime import datetime
from typing import List


def read_config():
    if "data_config.json" in os.listdir():
        with open("data_config.json", 'r') as config_file:
            data = json.load(config_file)
        return data

    return False


async def get_date(video):
    #224250109081232.mp4
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
            f"materials/{i}"
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

#test