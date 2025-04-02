import os

import psutil
import asyncio
import speedtest

from data.LoggerFactory import DefaultLoggerFactory

logger = DefaultLoggerFactory.create_logger('mdvr_system_guard', "system_guard.log")


async def check_cpu_temp():
    thermal_zone = 'thermal_zone0'  # Replace with the appropriate thermal zone
    file_path = f'/sys/class/thermal/{thermal_zone}/temp'

    with open(file_path, 'r') as file:
        temperature = int(file.read()) / 1_000

    return temperature


async def network_check():
    s = speedtest.Speedtest()
    return list(map(lambda x: x / 1_000_000, [s.download(), s.upload()]))

async def main():
    temp_cpu = await check_cpu_temp()
    cpu_persent_usage = psutil.cpu_percent()
    try:
        download_speed, upload_speed = await network_check()
    except speedtest.ConfigRetrievalError as e:
        logger.error(f"No internet connection: {e}")
        os.system("systemctl restart NetworkManager")
        download_speed, upload_speed = 0, 0

    logger.info(
        f"CPU usage: {cpu_persent_usage}% | "
        f"CPU temp: {temp_cpu} | "
        f"Download speed: {download_speed}Mbit/s | "
        f"Upload speed: {upload_speed}Mbit/s")


if __name__ == "__main__":
    asyncio.run(main())
