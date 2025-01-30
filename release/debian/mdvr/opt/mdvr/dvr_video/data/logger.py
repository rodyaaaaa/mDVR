import logging
from logging.handlers import TimedRotatingFileHandler


class Logger:
    def __init__(self, name: str, log_file: str = None, level: int = logging.INFO, when: str = 'midnight',
                 interval: int = 1):
        """
        :param name: Имя логгера.
        :param log_file: Путь к файлу для записи логов.
        :param level: Уровень логирования.
        :param when: Интервал ротации ('S', 'M', 'H', 'D', 'midnight', 'W0'-'W6').
        :param interval: Частота ротации.
        """
        self.logger = logging.getLogger(name)
        self.logger.setLevel(level)
        self.formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')

        # Если указан файл для логирования, добавляем обработчик с ротацией
        if log_file:
            file_handler = TimedRotatingFileHandler(log_file, when=when, interval=interval)
            file_handler.setFormatter(self.formatter)
            self.logger.addHandler(file_handler)

        # Добавляем обработчик для вывода в консоль
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(self.formatter)
        self.logger.addHandler(console_handler)

    def info(self, message: str):
        self.logger.info(message)

    def warning(self, message: str):
        self.logger.warning(message)

    def error(self, message: str):
        self.logger.error(message)

    def debug(self, message: str):
        self.logger.debug(message)

    def critical(self, message: str):
        self.logger.critical(message)
