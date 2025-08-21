import pathlib
import threading
import ffmpeg
import time

from datetime import datetime
from data.utils import read_config, move, generate_file_output_name, stop_ffmpeg, monitor_ffmpeg
from sdnotify import SystemdNotifier

from data.constants import VIDEO_OPTIONS_KEY, RTSP_OPTIONS_KEY, WATCH_DOG_NOTIFICATION, PROGRAM_OPTIONS_KEY, \
    DATE_FORMAT, DIR_NAME, CAMERA_LIST_KEY, VIDEO_FILE_EXTENSION, RTSP_X, RTSP_Y, FPS
from data.LoggerFactory import DefaultLoggerFactory
from main_common import async_write_photo

config = read_config()
logger = DefaultLoggerFactory.create_logger('mdvr_engine', "engine.log")
notifier = SystemdNotifier()
notifier.notify('READY=1')


def write_media(current_link: int, file_name: str, mode, config: dict):
    return async_write_photo(current_link,
                                   file_name,
                                   config) if mode \
        else async_write_video(current_link,
                                     file_name)


def async_write_video(current_link: int, file_name: str):
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
    process = ffmpeg.run_async(stream)

    return process


def main():
    pathlib.Path("temp").mkdir(exist_ok=True)
    pathlib.Path(DIR_NAME).mkdir(parents=True, exist_ok=True)
    photo_mode = bool(config[PROGRAM_OPTIONS_KEY]['photo_mode'])
    photo_timeout = int(config['photo_timeout'])

    move()

    while True:
        jobs, links_names = [], []

        for current_link in range(len(config[CAMERA_LIST_KEY])):
            file_name = datetime.now().strftime(DATE_FORMAT)
            try:
                # 0 - video, 1 - photo
                process = write_media(current_link,
                                            file_name,
                                            photo_mode,
                                            config)
            except Exception as e:
                logger.error(f"Failed to initialize camera {e}")
                continue

            stop_event = threading.Event()
            camera_name = f"camera_{current_link}_{file_name}"
            t = threading.Thread(target=monitor_ffmpeg, args=(process, logger, camera_name, stop_event), daemon=True)
            t.start()

            jobs.append({
                "proc": process,
                "monitor_thread": t,
                "stop_event": stop_event,
                "name": camera_name
            })
            links_names.append(str(current_link + 1) + "24" + file_name)

        for process in jobs:
            proc = process.get("proc")
            proc.wait()
        if not photo_mode:
            for count, process in enumerate(jobs):
                proc = process.get("proc")
                stop_event = process.get("stop_event")
                if stop_event:
                    stop_event.set()
                try:
                    rc = stop_ffmpeg(proc, logger, timeout=5)
                    if rc is not None and rc not in (0, 255):
                        logger.error(f"Camera unavailable. Return code: {rc}")
                    notifier.notify(WATCH_DOG_NOTIFICATION)
                except Exception as e:
                    logger.critical(f"Error while stopping ffmpeg process: {e}")
        else:
            notifier.notify(WATCH_DOG_NOTIFICATION)

        jobs.clear()
        move()

        if photo_timeout == 1:
            time.sleep(photo_timeout)


if __name__ == "__main__":
    main()

# video_name: 024%y%m%d%H%M%S
