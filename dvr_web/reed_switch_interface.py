import RPi.GPIO as GPIO

from abc import ABC, abstractmethod

from dvr_web.constants import BTN_A_PIN, BTN_B_PIN
from dvr_web.utils import load_config

class ReedSwitchInterface(ABC):
    @abstractmethod
    def setup(self):
        pass

    @abstractmethod
    def pressed(self):
        pass

    @abstractmethod
    def clean(self):
        pass

class ImpulseRS(ReedSwitchInterface):
    def __init__(self):
        self.event = None

    def setup(self):
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(BTN_A_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        GPIO.setup(BTN_B_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        GPIO.add_event_detect(BTN_A_PIN, GPIO.FALLING, callback=self.setup_a, bouncetime=75)
        GPIO.add_event_detect(BTN_B_PIN, GPIO.FALLING, callback=self.setup_b, bouncetime=75)

    def pressed(self):
        return self.event

    def setup_a(self, channel):
        print("A pressed")
        self.event = True

    def setup_b(self, channel):
        print("B pressed")
        self.event = False

    def clean(self):
        print("Impulse clean resourses")
        GPIO.cleanup()

class MexaRS(ReedSwitchInterface):
    def __init__(self, pin: int = 15):
        self.pin = pin
        self._gpio_initialized = False

    def setup(self):
        if not self._gpio_initialized:
            GPIO.setmode(GPIO.BCM)
            GPIO.setup(self.pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
            self._gpio_initialized = True

    def pressed(self):
        event = GPIO.input(self.pin)
        if event == GPIO.HIGH:
            print("Open")
            return True
        else:
            print("Closed")
            return False
        
    def clean(self):
        print("Mexa clean resourses")
        GPIO.cleanup()

class RSFactory:
    @staticmethod
    def create(impulse: bool) -> ReedSwitchInterface:
        config = load_config()
        if impulse:
            return ImpulseRS()
        else:
            door_sensor_pin = int(config['reed_switch']['door_sensor_pin'])
            return MexaRS(door_sensor_pin)
