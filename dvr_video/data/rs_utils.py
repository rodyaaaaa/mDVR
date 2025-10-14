import RPi.GPIO as GPIO

from .constants import BTN_A_PIN, BTN_B_PIN
from .utils import read_config
    

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
        print("A pressed. Opened.")
        self.event = False

    def setup_b(self, channel):
        print("B pressed. Closed.")
        self.event = True

    def clean(self):
        print("Impulse clean resourses")
        GPIO.cleanup()


class MexaRS(BaseGpio):
    def __init__(self, door_sensor_pin: int = 15):
        self.door_sensor_pin = door_sensor_pin

    def setup(self):
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(self.door_sensor_pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)

    def pressed(self):
        event = GPIO.input(self.door_sensor_pin)
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
    def create(impulse: bool) -> BaseGpio:
        config = read_config()
        if impulse:
            return ImpulseRS()
        else:
            door_sensor_pin = int(config['reed_switch']['door_sensor_pin'])
            return MexaRS(door_sensor_pin)
