import ffmpeg

from data.constants import VIDEO_FILE_EXTENSION, CAMERA_LIST_KEY, RTSP_OPTIONS_KEY
from data.utils import generate_file_output_name


async def async_write_photo(current_link: int, file_name: str, config: dict):
    stream = ffmpeg.input(config[CAMERA_LIST_KEY][current_link],
                          rtsp_transport=config[RTSP_OPTIONS_KEY]['rtsp_transport'])
    stream = ffmpeg.output(stream,
                           generate_file_output_name(current_link,
                                                     file_name,
                                                     VIDEO_FILE_EXTENSION),
                           format='image2')
    process = ffmpeg.run_async(stream)
    return process
