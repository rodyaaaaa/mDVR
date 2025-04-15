import asyncio
import pathlib
import ffmpeg
import time

import RPi.GPIO as GPIO

from datetime import datetime
from data.utils import read_config, move, generate_file_output_name
from sdnotify import SystemdNotifier

from data.constants import CAMERA_LIST_KEY, RTSP_OPTIONS_KEY, RTSP_X, RTSP_Y, VIDEO_OPTIONS_KEY, FPS, \
    DIR_NAME, DATE_FORMAT, PROGRAM_OPTIONS_KEY, VIDEO_FILE_EXTENSION, WATCH_DOG_NOTIFICATION
from data.LoggerFactory import LoggerFactory
from main_common import async_write_photo

config = read_config()
CustomFactory = LoggerFactory(level=10)
logger = CustomFactory.create_logger('mdvr_engine', "engine.log")
notifier = SystemdNotifier()
notifier.notify('READY=1')

GPIO.setmode(GPIO.BCM)
DOOR_SENSOR_PIN = 17
GPIO.setup(DOOR_SENSOR_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)

async def async_write_video(current_link, file_name):
    stream = ffmpeg.input(
        config[CAMERA_LIST_KEY][current_link],
        rtsp_transport='tcp',
        fflags='+genpts',
        **{'timeout': '15'}
    )
    stream = ffmpeg.filter(
        stream,
        'scale',
        width=config[RTSP_OPTIONS_KEY][RTSP_X],
        height=config[RTSP_OPTIONS_KEY][RTSP_Y]
    )
    stream = ffmpeg.filter(
        stream,
        'fps',
        fps=config[VIDEO_OPTIONS_KEY][FPS]
    )
    stream = ffmpeg.output(
        stream,
        generate_file_output_name(current_link, file_name, VIDEO_FILE_EXTENSION),
        vcodec="libx264"
    )
    process = ffmpeg.run_async(stream)
    return process


async def main():
    jobs, links_names = [], []
    pathlib.Path("temp").mkdir(exist_ok=True)
    pathlib.Path(DIR_NAME).mkdir(parents=True, exist_ok=True)
    photo_mode = bool(config[PROGRAM_OPTIONS_KEY]['photo_mode'])
    video_status = False

    await move()

    while True:
        notifier.notify(WATCH_DOG_NOTIFICATION)
        door_state = GPIO.input(DOOR_SENSOR_PIN)

        if door_state == GPIO.HIGH and video_status is False:
            time.sleep(0.5)
            door_state = GPIO.input(DOOR_SENSOR_PIN)
            if door_state == GPIO.HIGH:
                for current_link in range(len(config[CAMERA_LIST_KEY])):
                    now = datetime.now()
                    file_name = now.strftime(DATE_FORMAT)

                    try:
                        # 0 - video, 1 - photo
                        process = await async_write_photo(current_link,
                                                          file_name,
                                                          VIDEO_FILE_EXTENSION) if photo_mode \
                            else await async_write_video(current_link,
                                                         file_name)
                    except Exception as e:
                        logger.error(f"Failed to initialize camera {e}")
                        continue

                    jobs.append(process)
                    links_names.append(str(current_link + 1) + "24" + file_name)
                    video_status = True
        elif door_state != GPIO.HIGH and video_status is True:
            time.sleep(60)
            door_state = GPIO.input(DOOR_SENSOR_PIN)
            if door_state != GPIO.HIGH:
                for process in jobs:
                    process.terminate()
                    process.kill()

                video_status = False

            notifier.notify(WATCH_DOG_NOTIFICATION)

            jobs.clear()
            links_names.clear()
            await move()

        time.sleep(0.1)


if __name__ == "__main__":
    asyncio.run(main())

# video_name: 024%y%m%d%H%M%S
