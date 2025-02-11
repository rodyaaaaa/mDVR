import os
import pathlib
import aioftp

from data.utils import get_date, find_files_with_extra_after_log, extract_date_from_filename_async, file_date_sort


class FTPCon:
    def __init__(self, host_addr: str, port: int, username: str, password: str, car_name: str):
        self.port = port
        self.host = host_addr
        self.username = username
        self.password = password
        self.car_name = car_name

    async def upload_to_ftp(self, logger):
        async with aioftp.Client.context(self.host, self.port, self.username, self.password) as client:
            if await client.exists(self.car_name) is False:
                logger.error(f"Directory {self.car_name} does not exist. It will be created.")
                await client.make_directory(self.car_name)
            await client.change_directory(self.car_name)

            try:
                videos = os.listdir("materials")
            except FileNotFoundError as e:
                logger.error(f"Error {e}")
                pathlib.Path("materials").mkdir(exist_ok=True)

            print(videos)
            videos = file_date_sort(videos)
            print(videos)

            for video in videos:
                data = await get_date(video)
                print(data)
                if await client.exists(data) is False:
                    logger.error(f"Directory {data} does not exist. It will be create.")
                    await client.make_directory(data)
                await client.change_directory(data)

                if await client.exists(video):
                    logger.error(f"This file: {video} alredy exists. Remove and upload file.")
                    await client.remove(video)

                vd = pathlib.Path("materials", video)
                await client.upload(vd)
                logger.info(f"The file {video} has been successful upload. Remove from local storage.")
                os.remove(vd)

                await client.change_directory()

    async def upload_logs_to_ftp(self, logger):
        async with aioftp.Client.context(self.host, self.port, self.username, self.password) as client:
            if await client.exists(self.car_name) is False:
                logger.error(f"Directory {self.car_name} does not exist. It will be create.")
                await client.make_directory(self.car_name)
            await client.change_directory(self.car_name)

            try:
                folders = os.listdir("logs")
            except FileNotFoundError as e:
                logger.error(f"Error {e}")
                pathlib.Path("logs").mkdir(exist_ok=True)

            for folder in folders:
                logs_array = await find_files_with_extra_after_log(os.path.join("logs", folder))

                for log in logs_array:
                    date_folder = await extract_date_from_filename_async(log)

                    if await client.exists(date_folder) is False:
                        logger.error(f"Directory {date_folder} does not exist. It will be create.")
                        await client.make_directory(date_folder)
                    await client.change_directory(date_folder)

                    if await client.exists("logs") is False:
                        logger.error("Directory 'logs' does not exist. It will be create.")
                        await client.make_directory("logs")
                    await client.change_directory("logs")

                    if await client.exists(folder) is False:
                        logger.error(f"Directory {folder} does not exist. It will be create.")
                        await client.make_directory(folder)
                    await client.change_directory(folder)

                    if await client.exists(log):
                        logger.error(f"This file: {log} alredy exists. Remove and upload file.")
                        await client.remove(log)

                    lg = pathlib.Path("logs", folder, log)
                    print(log)

                    await client.upload(lg)
                    os.remove(os.path.join("logs", folder, log))

                    pt = pathlib.Path("/", self.car_name)

                    await client.change_directory()
                    await client.change_directory()
                    await client.change_directory()
