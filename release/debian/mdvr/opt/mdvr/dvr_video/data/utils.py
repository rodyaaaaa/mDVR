import json
import os
import shutil

from datetime import datetime


def read_config():
    if "data_config.json" in os.listdir():
        with open("data_config.json", 'r') as config_file:
            data = json.load(config_file)
        return data

    with open("default.json", 'r') as config_file:
        data = json.load(config_file)
    return data


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

#test