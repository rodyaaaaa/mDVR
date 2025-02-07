import asyncio
import pathlib

from data.ftp import FTPCon
from data.utils import read_config
from data.logger import Logger

config = read_config()
pathlib.Path("logs/mdvr_ftp").mkdir(parents=True, exist_ok=True)
logger = Logger('mdvr_ftp', "logs/mdvr_ftp/ftp.log", 10, "H", 2)


async def main():
    logger.info("FTP engine start")
    pathlib.Path("materials").mkdir(parents=True, exist_ok=True)

    server = config['ftp']['server']
    user = config['ftp']['user']
    password = config['ftp']['password']
    port = config['ftp']['port']
    car_name = config['ftp']['car_name']

    ftp = FTPCon(server, port, user, password, car_name)

    await ftp.upload_to_ftp(logger)
    await ftp.upload_logs_to_ftp(logger)

    logger.info("FTP Engine has finished successfully.")


if __name__ == "__main__":
    asyncio.run(main())