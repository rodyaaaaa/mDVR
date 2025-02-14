import os
import pathlib
import psutil
import asyncio

from data.logger import Logger

pathlib.Path("logs/mdvr_system_guard").mkdir(parents=True, exist_ok=True)
logger = Logger('mdvr_system_guard', "logs/mdvr_system_guard/system_guard.log", 10, "H", 2)


async def main():
        load1, load5, load15 = psutil.getloadavg()

        cpu_usage = (load15 / os.cpu_count()) * 100

        check_temp_cpu = os.popen("cat /sys/class/thermal/thermal_zone0/temp").read()

        check_temp_cpu = int(check_temp_cpu) / 1000

        logger.info(f"System: CPU usage: {cpu_usage} | CPU temp: {check_temp_cpu}")


if __name__ == "__main__":
    asyncio.run(main())