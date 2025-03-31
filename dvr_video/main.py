import asyncio
import pathlib
import ffmpeg
import time

from datetime import datetime
from data.utils import read_config, move, generate_file_output_name
from sdnotify import SystemdNotifier

from dvr_video.constants import VIDEO_OPTIONS_KEY, RTSP_OPTIONS_KEY, WATCH_DOG_NOTIFICATION, PROGRAM_OPTIONS_KEY, \
    DATE_FORMAT, DIR_NAME, CAMERA_LIST_KEY, VIDEO_FILE_EXTENSION, RTSP_X, RTSP_Y, FPS
from dvr_video.data.LoggerFactory import DefaultLoggerFactory
from dvr_video.main_common import async_write_photo

config = read_config()
logger = DefaultLoggerFactory.create_logger('mdvr_engine', "engine.log")
notifier = SystemdNotifier()
notifier.notify('READY=1')


async def write_media(current_link: int, file_name: str, mode, config: dict):
    return await async_write_photo(current_link,
                                   file_name,
                                   config) if mode \
        else await async_write_video(current_link,
                                     file_name)


async def async_write_video(current_link: int, file_name: str):
    stream = ffmpeg.input(config[CAMERA_LIST_KEY][current_link],
                          t=str(config[VIDEO_OPTIONS_KEY]['video_duration']),
                          rtsp_transport='tcp')
    stream = ffmpeg.filter(stream,
                           'scale',
                           width=config[RTSP_OPTIONS_KEY][RTSP_X],
                           height=config[RTSP_OPTIONS_KEY][RTSP_Y])
    stream = ffmpeg.filter(stream,
                           'fps',
                           fps=config[VIDEO_OPTIONS_KEY][FPS])
    stream = ffmpeg.output(stream,
                           generate_file_output_name(current_link,
                                                     file_name,
                                                     VIDEO_FILE_EXTENSION),
                           vcodec="libx264")
    process = ffmpeg.run_async(stream, quiet=True)

    return process


async def main():
    pathlib.Path("temp").mkdir(exist_ok=True)
    pathlib.Path(DIR_NAME).mkdir(parents=True, exist_ok=True)
    photo_mode = bool(config[PROGRAM_OPTIONS_KEY]['photo_mode'])
    photo_timeout = int(config['photo_timeout'])

    await move()

    while True:
        jobs, links_names = [], []

        for current_link in range(len(config[CAMERA_LIST_KEY])):
            file_name = datetime.now().strftime(DATE_FORMAT)
            try:
                # 0 - video, 1 - photo
                process = await write_media(current_link,
                                            file_name,
                                            photo_mode,
                                            config)
            except Exception as e:
                logger.error(f"Failed to initialize camera {e}")
                continue

            jobs.append(process)
            links_names.append(str(current_link + 1) + "24" + file_name)

        # Очікує на завершения усіх фоновых процесів
        for process in jobs:
            process.wait()
        if not photo_mode:
            for count, process in enumerate(jobs):
                if process.returncode != 0 and process.returncode != 234:
                    logger.error(
                        f"Returncode: {process.returncode}. "
                        f"Camera {count + 1} failed to record file: {links_names[count]}")
                else:
                    notifier.notify(WATCH_DOG_NOTIFICATION)
        else:
            notifier.notify(WATCH_DOG_NOTIFICATION)

        jobs.clear()
        await move()

        if photo_timeout == 1:
            time.sleep(photo_timeout)


if __name__ == "__main__":
    asyncio.run(main())

# video_name: 024%y%m%d%H%M%S
