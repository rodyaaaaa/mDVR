import RPi.GPIO as GPIO

from .constants import BTN_A_PIN, BTN_B_PIN
from dvr_web.utils import load_config
    

class BaseGpio:
    def setup(self):
        raise NotImplementedError
    
    def pressed(self):
        raise NotImplementedError
    

class ImpulseRS(BaseGpio):
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


class MexaRS(BaseGpio):
    def __init__(self, door_sensor_pin: int = 15):
        self.door_sensor_pin = door_sensor_pin
        self.gpio = None

    def setup(self):
        self.gpio = GPIO.setmode(GPIO.BCM)
        self.gpio = GPIO.setup(self.door_sensor_pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)

    def pressed(self):
        event = self.gpio.input(self.door_sensor_pin)
        if event == GPIO.HIGH:
            print("Open")
            return True
        else:
            print("Closed")
            return False


class RSFactory:
    @staticmethod
    def create(impulse: bool) -> BaseGpio:
        config = load_config()
        if impulse:
            return ImpulseRS()
        else:
            door_sensor_pin = int(config['reed_switch']['door_sensor_pin'])
            return MexaRS(door_sensor_pin)
