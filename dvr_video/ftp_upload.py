import asyncio
import pathlib
import aioftp

from data.ftp_utils import upload_to_ftp, upload_logs_to_ftp
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
    car_name = str(config['program_options']['imei'])

    async with aioftp.Client.context(server, port, user, password) as client:
        if await client.exists(car_name) is False:
            logger.error(f"Directory {car_name} does not exist. It will be created.")
            await client.make_directory(car_name)

        await upload_logs_to_ftp(client, logger, car_name)
        await upload_to_ftp(client, logger, car_name)


if __name__ == "__main__":
    asyncio.run(main())