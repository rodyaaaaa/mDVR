import RPi.GPIO as GPIO

from .constants import BTN_A_PIN, BTN_B_PIN, DOOR_SENSOR_PIN
    

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
    def __init__(self):
        self.gpio = None

    def setup(self):
        self.gpio = GPIO.setmode(GPIO.BCM)
        self.gpio = GPIO.setup(DOOR_SENSOR_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)

    def pressed(self):
        event = self.gpio.input(DOOR_SENSOR_PIN)
        if event == GPIO.HIGH:
            print("Open")
            return True
        elif event != GPIO.HIGH:
            print("Closed")
            return False


class RSFactory:
    @staticmethod
    def create(impulse: bool, **kwargs) -> BaseGpio:
        if impulse:
            return ImpulseRS(**kwargs)
        else:
            return MexaRS(**kwargs)
