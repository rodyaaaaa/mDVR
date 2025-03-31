import asyncio
import os

from datetime import datetime

from data.utils import read_config
from dvr_video.constants import DATE_FORMAT, VIDEO_FILE_EXTENSION, DIR_NAME, PROGRAM_OPTIONS_KEY
from dvr_video.data.LoggerFactory import DefaultLoggerFactory


config = read_config()
logger = DefaultLoggerFactory.create_logger('mdvr_space_check', "space_check.log")


async def extract_date_from_filename(filename: str) -> None | datetime:
    try:
        date_str = filename[3:15]
        date_obj = datetime.strptime(date_str, DATE_FORMAT)
        return date_obj
    except ValueError:
        return None


async def find_oldest_video(directory: str) -> tuple[str | None, datetime | None]:
    oldest_date, oldest_file = None, None

    for filename in os.listdir(directory):
        if filename.endswith(VIDEO_FILE_EXTENSION):
            date_obj = await extract_date_from_filename(filename)
            if date_obj:
                if oldest_date is None or date_obj < oldest_date:
                    oldest_date = date_obj
                    oldest_file = filename

    return oldest_file, oldest_date


async def get_dir_size(path: str = '.') -> int | float:
    total = 0
    with os.scandir(path) as it:
        for entry in it:
            if entry.is_file():
                total += entry.stat().st_size
            elif entry.is_dir():
                total += get_dir_size(entry.path)
    return total


async def from_gb_to_bytes(gb: int) -> int:
    return gb * 1_000_000_000


async def main():
    logger.info("Space Check start.")
    bt = await get_dir_size(DIR_NAME)

    folder_size_limit = config[PROGRAM_OPTIONS_KEY]['size_folder_limit_gb']

    folder_size_limit = await from_gb_to_bytes(folder_size_limit)

    print(folder_size_limit)
    logger.info(f"{folder_size_limit}")

    if bt > folder_size_limit:
        while bt > folder_size_limit:
            print(os.listdir(DIR_NAME))
            logger.info(f"{os.listdir(DIR_NAME)}")

            oldest_file, oldest_date = await find_oldest_video(DIR_NAME)

            print(oldest_file, oldest_date)
            logger.info(f"{oldest_file}, {oldest_date}")

            filepath = os.path.join(DIR_NAME, oldest_file)

            os.remove(filepath)

            bt = await get_dir_size(DIR_NAME)
            logger.info(bt)


if __name__ == "__main__":
    asyncio.run(main())
