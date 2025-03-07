import os
import pathlib

import psutil
import asyncio
import speedtest
import math

from data.logger import Logger

pathlib.Path("logs/mdvr_system_guard").mkdir(parents=True, exist_ok=True)
logger = Logger('mdvr_system_guard', "logs/mdvr_system_guard/system_guard.log", 10, "H", 2)


async def check_cpu_temp():
    thermal_zone = 'thermal_zone0'  # Replace with the appropriate thermal zone
    file_path = f'/sys/class/thermal/{thermal_zone}/temp'

    with open(file_path, 'r') as file:
        temperature = int(file.read()) / 1000

    return temperature


async def network_check():
    s = speedtest.Speedtest()

    download_speed = s.download()
    upload_speed = s.upload()

    download_speed = math.floor(download_speed / 1000000)
    upload_speed = math.floor(upload_speed / 1000000)

    return download_speed, upload_speed


async def main():
    temp_cpu = await check_cpu_temp()
    cpu_persent_usage = psutil.cpu_percent()
    try:
        download_speed, upload_speed = await network_check()
    except speedtest.ConfigRetrievalError as e:
        logger.error(f"No internet connection: {e}")
        os.system("systemctl restart NetworkManager")
        download_speed, upload_speed = 0, 0

    logger.info(f"CPU usage: {cpu_persent_usage}% | CPU temp: {temp_cpu} | Download speed: {download_speed}Mbit/s | Upload speed: {upload_speed}Mbit/s")


if __name__ == "__main__":
    asyncio.run(main())
