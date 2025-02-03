import asyncio
import pathlib
import ffmpeg
from datetime import datetime
from data.logger import Logger
from data.utils import read_config, move
from sdnotify import SystemdNotifier

config = read_config()
pathlib.Path("logs/mdvr_engine").mkdir(parents=True, exist_ok=True)
logger = Logger('mdvr_engine', "logs/mdvr_engine/engine.log", 10, "S", 2)
notifier = SystemdNotifier()
notifier.notify('READY=1')

async def async_write_video(current_link, video_name):
    stream = ffmpeg.input(config['camera_list'][current_link], t=str(config['video_options']['time']), rtsp_transport='tcp')
    stream = ffmpeg.filter(stream, 'scale', width=config['video_options']['video_resolution_x'], height=config['video_options']['video_resolution_y'])
    stream = ffmpeg.output(stream, f"temp/{current_link+1}24{video_name}.mp4", vcodec="libx264")
    process = ffmpeg.run_async(stream)

    return process


async def main():
    logger.info("Start mdvr engine")
    pathlib.Path("temp").mkdir(exist_ok=True)
    pathlib.Path("materials").mkdir(parents=True, exist_ok=True)

    await move()

    while True:
        notifier.notify("WATCHDOG=1")
        jobs = []
        video_names = []

        for current_link in range(len(config['camera_list'])):
            now = datetime.now()
            video_name = now.strftime("%y%m%d%H%M%S")

            try:
                process = await async_write_video(current_link, video_name)
                jobs.append(process)
                video_names.append(str(current_link + 1) + "24" + video_name + ".mp4")
            except Exception as e:
                logger.error(f"Не вдалось записати відео {e}")


            # Очікує на завершения усіх фоновых процесів
            if len(jobs) >= len(config['camera_list']):
                for count, process in enumerate(jobs):
                    process.communicate()
                    if process.returncode != 0:
                        logger.error(f"Камера {current_link + 1} не вдалось записати відео: {video_names[count]}")
                    elif process.returncode == 0:
                        logger.info(f"Камера {current_link + 1} записала відео: {video_names[count]}")
                jobs.clear()

        await move()


if __name__ == "__main__":
    asyncio.run(main())
