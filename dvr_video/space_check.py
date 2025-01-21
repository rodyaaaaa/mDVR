import asyncio
import logging
import os
from datetime import datetime


logging.basicConfig(level=logging.INFO)


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


async def main():
    bt = await get_dir_size("materials")

    if bt > 1000000000:
        while bt > 1000000000:
            print(os.listdir("materials"))
            logging.info(os.listdir("materials"))

            oldest_file, oldest_date = await find_oldest_video("materials")

            print(oldest_file, oldest_date)
            logging.info(f"{oldest_file}, {oldest_date}")

            filepath = os.path.join("materials", oldest_file)

            os.remove(filepath)

            bt = await get_dir_size("materials")


if __name__ == "__main__":
    asyncio.run(main())