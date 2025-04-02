import os
import pathlib

from .logger import Logger


class LoggerFactory:  # TODO: add validations
    def __init__(self, level: int = 20,
                 when: str = 'H',
                 interval: int = 2,
                 parent_dir_name: str = 'logs'):
        self._level = level
        self._when = when
        self._interval = interval
        self._parent_dir_name = parent_dir_name

    def create_logger(self, name: str, filename: str):
        parent_folder = os.path.join(self._parent_dir_name, name)
        pathlib.Path(parent_folder).mkdir(parents=True, exist_ok=True)
        return Logger(name,
                      os.path.join(parent_folder, filename),
                      self._level,
                      self._when,
                      self._interval)


DefaultLoggerFactory = LoggerFactory()
