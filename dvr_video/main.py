import asyncio
import pathlib
import ffmpeg
from datetime import datetime
from data.logger import Logger
from data.utils import read_config, move
from data.ftp import FTPCon
from sdnotify import SystemdNotifier

config = read_config()
logger = Logger('dvr')
notifier = SystemdNotifier()
notifier.notify('READY=1')

async def async_write_video(current_link, video_name):
    stream = ffmpeg.input(config['camera_list'][current_link], t=str(config['video_options']['time']), rtsp_transport='tcp')
    stream = ffmpeg.filter(stream, 'scale', width=config['video_options']['video_resolution_x'], height=config['video_options']['video_resolution_y'])
    stream = ffmpeg.output(stream, f"temp/{current_link+1}24{video_name}.mp4", vcodec="libx265")
    process = ffmpeg.run_async(stream)

    return process


async def main():
    pathlib.Path("temp").mkdir(exist_ok=True)
    pathlib.Path("materials").mkdir(parents=True, exist_ok=True)

    server = config['ftp']['server']
    user = config['ftp']['user']
    password = config['ftp']['password']
    port = config['ftp']['port']
    car_name = config['car_name']

    ftp = FTPCon(server, port, user, password, car_name)

    await move()

    while True:
        notifier.notify("WATCHDOG=1")
        jobs = []

        for current_link in range(len(config['camera_list'])):
            now = datetime.now()
            video_name = now.strftime("%y%m%d%H%M%S")

            try:
                process = await async_write_video(current_link, video_name)
                jobs.append(process)
            except Exception as e:
                logger.error(f"Не вдалось записати відео {e}")


            # Очікує на завершения усіх фоновых процесів
            if len(jobs) >= len(config['camera_list']):
                for process in jobs:
                    process.communicate()
                    if process.returncode != 0:
                        logger.error(f"Камера {current_link} не вдалось записати відео")
                jobs.clear()

        await move()


if __name__ == "__main__":
    asyncio.run(main())
