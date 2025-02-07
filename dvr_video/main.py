import asyncio
import pathlib

import ffmpeg
from data.logger import Logger
from data.utils import read_config, move

config = read_config()
pathlib.Path("logs/mdvr_engine").mkdir(parents=True, exist_ok=True)
logger = Logger('mdvr_engine', "logs/mdvr_engine/engine.log", 10, "H", 2)

async def async_write_video(current_link):
    stream = ffmpeg.input(config['camera_list'][current_link], rtsp_transport=config['rtsp_options']['rtsp_transport'])
    stream = ffmpeg.filter(stream, 'scale', width=config['rtsp_options']['rtsp_resolution_x'], height=config['rtsp_options']['rtsp_resolution_y'])
    stream = ffmpeg.filter(stream, 'fps', fps=config['video_options']['fps'])
    stream = ffmpeg.output(stream, f"materials/{current_link+1}24%y%m%d%H%M%S.mp4", vcodec="libx264", format='segment', segment_time=config['video_options']['video_duration'], strftime=1)
    process = ffmpeg.run_async(stream, quiet=True)
    return process


async def async_write_photo(current_link):
    stream = ffmpeg.input(config['camera_list'][current_link], rtsp_transport=config['rtsp_options']['rtsp_transport'])
    stream = ffmpeg.filter(stream, 'fps', fps=1/config['photo_timeout'])
    stream = ffmpeg.output(stream, f"materials/{current_link+1}24%y%m%d%H%M%S.jpg", format='image2', strftime=1)
    process = ffmpeg.run_async(stream, quiet=True)
    return process


async def main():
    logger.info("Start mdvr engine")
    pathlib.Path("materials").mkdir(parents=True, exist_ok=True)

    jobs = []

    for current_link in range(len(config['camera_list'])):
        if config['program_options']['write_mode'] == "video":
            try:
                process = await async_write_video(current_link)
                jobs.append(process)
            except Exception as e:
                logger.error(f"Не вдалось ініціалізувати відео {e}")
        elif config['program_options']['write_mode'] == "photo":
            try:
                process = await async_write_photo(current_link)
                jobs.append(process)
            except Exception as e:
                logger.error(f"Не вдалось ініціалізувати відео {e}")

    # Очікує на завершения усіх фоновых процесів
    if len(jobs) >= len(config['camera_list']):
        for process in jobs:
            process.communicate()
        for count, process in enumerate(jobs):
            if process.returncode != 0:
                logger.error(f"Камера {count + 1} не вдалось записати відео")
            elif process.returncode == 0:
                logger.info(f"Камера {count + 1} записала відео")
        jobs.clear()


if __name__ == "__main__":
    asyncio.run(main())

#video_name: 024%y%m%d%H%M%S