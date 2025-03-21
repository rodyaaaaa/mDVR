import asyncio
import os
import pathlib

from datetime import datetime

from data.utils import read_config
from data.logger import Logger

config = read_config()
pathlib.Path("logs/mdvr_space_check").mkdir(parents=True, exist_ok=True)
logger = Logger('mdvr_space_check', "logs/mdvr_space_check/space_check.log", 20, "H", 2)


async def extract_date_from_filename(filename):
    try:
        date_str = filename[3:15]
        date_obj = datetime.strptime(date_str, "%y%m%d%H%M%S")
        return date_obj
    except ValueError:
        return None

async def find_oldest_video(directory):
    oldest_date = None
    oldest_file = None

    for filename in os.listdir(directory):
        if filename.endswith(".mp4"):
            date_obj = await extract_date_from_filename(filename)
            if date_obj:
                if oldest_date is None or date_obj < oldest_date:
                    oldest_date = date_obj
                    oldest_file = filename

    return oldest_file, oldest_date


async def get_dir_size(path='.'):
    total = 0
    with os.scandir(path) as it:
        for entry in it:
            if entry.is_file():
                total += entry.stat().st_size
            elif entry.is_dir():
                total += get_dir_size(entry.path)
    return total


async def from_gb_to_bytes(gb: int) -> int:
    return gb * 1000000000


async def main():
    logger.info("Space Check start.")
    bt = await get_dir_size("materials")

    folder_size_limit = config['program_options']['size_folder_limit_gb']

    folder_size_limit= await from_gb_to_bytes(folder_size_limit)

    print(folder_size_limit)
    logger.info(f"{folder_size_limit}")

    if bt > folder_size_limit:
        while bt > folder_size_limit:
            print(os.listdir("materials"))
            logger.info(f"{os.listdir('materials')}")

            oldest_file, oldest_date = await find_oldest_video("materials")

            print(oldest_file, oldest_date)
            logger.info(f"{oldest_file}, {oldest_date}")

            filepath = os.path.join("materials", oldest_file)

            os.remove(filepath)

            bt = await get_dir_size("materials")
            logger.info(bt)


if __name__ == "__main__":
    asyncio.run(main())