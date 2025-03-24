import asyncio
import pathlib
import ffmpeg
import time

import RPi.GPIO as GPIO

from datetime import datetime
from data.logger import Logger
from data.utils import read_config, move
from sdnotify import SystemdNotifier

config = read_config()
pathlib.Path("logs/mdvr_engine").mkdir(parents=True, exist_ok=True)
logger = Logger('mdvr_engine', "logs/mdvr_engine/engine.log", 10, "H", 2)
notifier = SystemdNotifier()
notifier.notify('READY=1')

GPIO.setmode(GPIO.BCM)
DOOR_SENSOR_PIN = 16
GPIO.setup(DOOR_SENSOR_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)

async def async_write_video(current_link, file_name):
    stream = ffmpeg.input(
        config['camera_list'][current_link],
        rtsp_transport='tcp',
        fflags='+genpts',
        **{'timeout': '15'}
    )
    stream = ffmpeg.filter(
        stream,
        'scale',
        width=config['rtsp_options']['rtsp_resolution_x'],
        height=config['rtsp_options']['rtsp_resolution_y']
    )
    stream = ffmpeg.filter(
        stream,
        'fps',
        fps=config['video_options']['fps']
    )
    stream = ffmpeg.output(
        stream,
        f"temp/{current_link+1}24{file_name}.mp4",
        vcodec="libx264",
        movflags="+frag_keyframe+separate_moof+omit_tfhd_offset+empty_moov"
    )
    process = ffmpeg.run_async(stream, quiet=True)
    return process


async def async_write_photo(current_link, file_name):
    stream = ffmpeg.input(config['camera_list'][current_link], rtsp_transport=config['rtsp_options']['rtsp_transport'])
    stream = ffmpeg.output(stream, f"temp/{current_link+1}24{file_name}.jpg", format='image2')
    process = ffmpeg.run_async(stream, quiet=True)
    return process


async def main():
    jobs = []
    links_names = []
    pathlib.Path("temp").mkdir(exist_ok=True)
    pathlib.Path("materials").mkdir(parents=True, exist_ok=True)
    photo_mode = bool(config['program_options']['photo_mode'])
    video_status = False

    await move()

    while True:
        notifier.notify("WATCHDOG=1")
        door_state = GPIO.input(DOOR_SENSOR_PIN)

        if door_state == GPIO.HIGH and video_status == False:
            time.sleep(0.5)
            door_state = GPIO.input(DOOR_SENSOR_PIN)
            if door_state == GPIO.HIGH:
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
                    video_status = True
        elif door_state != GPIO.HIGH and video_status == True:
            time.sleep(60)
            door_state = GPIO.input(DOOR_SENSOR_PIN)
            if door_state != GPIO.HIGH:
                for process in jobs:
                    process.terminate()
                    process.kill()

                video_status = False

            notifier.notify("WATCHDOG=1")

            jobs.clear()

            await move()

        time.sleep(0.1)


if __name__ == "__main__":
    asyncio.run(main())

#video_name: 024%y%m%d%H%M%S