import asyncio

from dvr_video.data.LoggerFactory import DefaultLoggerFactory

logger = DefaultLoggerFactory.create_logger('mdvr_start', "start.log")


async def main():
    logger.info("System start")


if __name__ == "__main__":
    asyncio.run(main())
