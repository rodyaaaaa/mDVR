import asyncio
import pathlib
import ffmpeg
import time

from datetime import datetime
from data.logger import Logger
from data.utils import read_config, move
from sdnotify import SystemdNotifier

config = read_config()
pathlib.Path("logs/mdvr_engine").mkdir(parents=True, exist_ok=True)
logger = Logger('mdvr_engine', "logs/mdvr_engine/engine.log", 10, "H", 2)
notifier = SystemdNotifier()
notifier.notify('READY=1')

async def async_write_video(current_link, file_name):
    stream = ffmpeg.input(config['camera_list'][current_link], t=str(config['video_options']['video_duration']), rtsp_transport='tcp')
    stream = ffmpeg.filter(stream, 'scale', width=config['rtsp_options']['rtsp_resolution_x'], height=config['rtsp_options']['rtsp_resolution_y'])
    stream = ffmpeg.output(stream, f"temp/{current_link+1}24{file_name}.mp4", vcodec="libx264")
    process = ffmpeg.run_async(stream, quiet=True)

    return process


async def async_write_photo(current_link, file_name):
    stream = ffmpeg.input(config['camera_list'][current_link], rtsp_transport=config['rtsp_options']['rtsp_transport'])
    stream = ffmpeg.output(stream, f"temp/{current_link+1}24{file_name}.jpg", format='image2')
    process = ffmpeg.run_async(stream, quiet=True)
    return process


async def main():
    pathlib.Path("temp").mkdir(exist_ok=True)
    pathlib.Path("materials").mkdir(parents=True, exist_ok=True)
    photo_mode = bool(config['program_options']['photo_mode'])
    photo_timeout = int(config['photo_timeout'])

    await move()

    while True:
        notifier.notify("WATCHDOG=1")
        jobs = []
        links_names = []

        for current_link in range(len(config['camera_list'])):
            now = datetime.now()
            file_name = now.strftime("%y%m%d%H%M%S")

            try:
                # 0 - video, 1 - photo
                process = await async_write_photo(current_link, file_name) if photo_mode\
                    else await async_write_video(current_link, file_name)
            except Exception as e:
                logger.error(f"Failed to initialize camera {e}")
                continue

            jobs.append(process)
            links_names.append(str(current_link + 1) + "24" + file_name)

        # Очікує на завершения усіх фоновых процесів
        for process in jobs:
            process.communicate()
        for count, process in enumerate(jobs):
            if process.returncode != 0 and process.returncode != 234:
                logger.error(f"Camera {count + 1} failed to record file: {links_names[count]}")
        jobs.clear()

        await move()

        if photo_timeout:
            time.sleep(photo_timeout)


if __name__ == "__main__":
    asyncio.run(main())

#video_name: 024%y%m%d%H%M%S