import asyncio
import pathlib

from data.ftp import FTPCon
from data.utils import read_config

config = read_config()


async def main():
    pathlib.Path("materials").mkdir(parents=True, exist_ok=True)

    server = config['ftp']['server']
    user = config['ftp']['user']
    password = config['ftp']['password']
    port = config['ftp']['port']
    car_name = config['car_name']

    ftp = FTPCon(server, port, user, password, car_name)

    await ftp.upload_to_ftp()


if __name__ == "__main__":
    asyncio.run(main())