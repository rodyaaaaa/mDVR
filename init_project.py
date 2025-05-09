import asyncio
import logging
import os
from datetime import datetime
import subprocess

from dvr_video.data.constants import LOG_DIR
from dvr_video.data.utils import get_ext5v_v


def get_logger(log_dir: str):
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)
    class SingleFileHandler(logging.Handler):
        def emit(self, record):
            log_time = datetime.now().strftime("%Y-%m-%d_%H_%M_%S")
            log_filename = os.path.join(log_dir, f"start.log.{log_time}")
            with open(log_filename, "w", encoding="utf-8") as f:
                f.write(self.format(record) + "\n")
    logger = logging.getLogger("single_file_logger")
    logger.setLevel(logging.INFO)
    logger.handlers = []
    handler = SingleFileHandler()
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    return logger


async def main():
    log_dir = os.path.join(LOG_DIR, "mdvr_start")
    logger = get_logger(log_dir)
    ext5v_v = get_ext5v_v()
    print(ext5v_v)
    logger.info(f"Start system | EXT5V_V: {ext5v_v}")


if __name__ == "__main__":
    asyncio.run(main())
