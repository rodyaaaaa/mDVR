import asyncio
import pathlib

from data.ftp import FTPCon
from data.utils import read_config
from dvr_video.data.LoggerFactory import DefaultLoggerFactory

config = read_config()
logger = DefaultLoggerFactory.create_logger('mdvr_ftp', "ftp.log")


async def main():
    pathlib.Path("temp").mkdir(exist_ok=True)
    pathlib.Path("materials").mkdir(parents=True, exist_ok=True)

    ftp_config_key = 'ftp'

    server = config[ftp_config_key]['server']
    user = config[ftp_config_key]['user']
    password = config[ftp_config_key]['password']
    port = config[ftp_config_key]['port']
    car_name = str(config['program_options']['imei'])

    ftp = FTPCon(server, port, user, password, car_name)

    await ftp.upload_to_ftp(logger)
    await ftp.upload_logs_to_ftp(logger)


if __name__ == "__main__":
    asyncio.run(main())
