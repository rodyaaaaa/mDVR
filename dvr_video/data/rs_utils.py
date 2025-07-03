import RPi.GPIO as GPIO

from gpiozero import Button

from .constants import BTN_A_PIN, BTN_B_PIN, DOOR_SENSOR_PIN
    

class BaseGpio:
    def setup(self):
        raise NotImplementedError
    
    def pressed(self):
        raise NotImplementedError
    

class ImpulseRS(BaseGpio):
    def __init__(self):
        self.pin_a = None
        self.pin_b = None
        self.event = None

    def setup(self):
        self.pin_a = Button(BTN_A_PIN, pull_up=True, bounce_time=0.001)
        self.pin_b = Button(BTN_B_PIN, pull_up=True, bounce_time=0.001)

    def pressed(self):
        self.pin_a.when_pressed = self.setup_a
        self.pin_b.when_pressed = self.setup_b

        return self.event

    def setup_a(self):
        print("A pressed")
        self.event = True

    def setup_b(self):
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
