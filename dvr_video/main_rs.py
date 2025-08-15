import pathlib
import threading
import ffmpeg
import time

from datetime import datetime
from sdnotify import SystemdNotifier

from data.constants import CAMERA_LIST_KEY, RTSP_OPTIONS_KEY, RTSP_X, RTSP_Y, VIDEO_OPTIONS_KEY, FPS, \
    DIR_NAME, DATE_FORMAT, PROGRAM_OPTIONS_KEY, VIDEO_FILE_EXTENSION, WATCH_DOG_NOTIFICATION
from data.utils import read_config, move, generate_file_output_name, stop_ffmpeg, monitor_ffmpeg
from data.LoggerFactory import LoggerFactory
from main_common import async_write_photo
from data.rs_utils import RSFactory

config = read_config()
CustomFactory = LoggerFactory(level=20)
logger = CustomFactory.create_logger('mdvr_engine', "engine.log")
notifier = SystemdNotifier()
notifier.notify('READY=1')


def async_write_video(current_link, file_name):
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
    process = ffmpeg.run_async(stream, pipe_stdout=True, pipe_stderr=True)
    return process


def main():
    jobs, links_names = [], []
    pathlib.Path("temp").mkdir(exist_ok=True)
    pathlib.Path(DIR_NAME).mkdir(parents=True, exist_ok=True)
    photo_mode = bool(config[PROGRAM_OPTIONS_KEY]['photo_mode'])
    video_status = False
    impulseCheck = bool(config['reed_switch']['impulse'])
    rs = RSFactory.create(impulseCheck)
    rs.setup()

    move()

    while True:
        notifier.notify(WATCH_DOG_NOTIFICATION)
        door_state = rs.pressed()

        if door_state is True and video_status is False:
            time.sleep(0.5)
            door_state = rs.pressed()
            if door_state is True:
                for current_link in range(len(config[CAMERA_LIST_KEY])):
                    now = datetime.now()
                    file_name = now.strftime(DATE_FORMAT)

                    try:
                        # 0 - video, 1 - photo
                        process = async_write_photo(current_link,
                                                     file_name,
                                                     VIDEO_FILE_EXTENSION) if photo_mode \
                            else async_write_video(current_link,
                                                   file_name)
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
                    video_status = True
        elif door_state is False and video_status is True:
            time.sleep(config["reed_switch"]["rs_timeout"])
            if impulseCheck is False:
                door_state = rs.pressed()
            if door_state is False:
                for entry in jobs:
                    proc = entry.get("proc")
                    stop_event = entry.get("stop_event")
                    if stop_event:
                        stop_event.set()
                    try:
                        rc = stop_ffmpeg(proc, logger, timeout=5)
                        if rc is not None and rc not in (0, 255):
                            logger.error(f"Camera unavailable. Return code: {rc}")
                    except Exception as e:
                        logger.critical(f"Error while stopping ffmpeg process: {e}")

                jobs.clear()
                links_names.clear()
                move()
                video_status = False

            notifier.notify(WATCH_DOG_NOTIFICATION)

        time.sleep(0.1)


if __name__ == "__main__":
    main()

# video_name: 024%y%m%d%H%M%S
