import asyncio
import pathlib

from data.ftp import FTPCon
from data.utils import read_config
from data.logger import Logger

config = read_config()
pathlib.Path("logs/mdvr_ftp").mkdir(parents=True, exist_ok=True)
logger = Logger('mdvr_ftp', "logs/mdvr_ftp/ftp.log", 10, "H", 2)


async def main():
    pathlib.Path("temp").mkdir(exist_ok=True)
    pathlib.Path("materials").mkdir(parents=True, exist_ok=True)

    server = config['ftp']['server']
    user = config['ftp']['user']
    password = config['ftp']['password']
    port = config['ftp']['port']
    car_name = config['program_options']['imei']

    ftp = FTPCon(server, port, user, password, car_name)

    await ftp.upload_to_ftp(logger)
    await ftp.upload_logs_to_ftp(logger)


if __name__ == "__main__":
    asyncio.run(main())