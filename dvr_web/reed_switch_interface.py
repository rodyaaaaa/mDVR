"""
Уніфікований інтерфейс та фабрика для роботи з різними типами герконів (reed switch).
"""
import RPi.GPIO as GPIO
from gpiozero import Button
from dvr_web.constants import BTN_A_PIN, BTN_B_PIN, DOOR_SENSOR_PIN
from abc import ABC, abstractmethod

class ReedSwitchInterface(ABC):
    @abstractmethod
    def setup(self):
        pass

    @abstractmethod
    def pressed(self):
        pass

class ImpulseRS(ReedSwitchInterface):
    def __init__(self, pin_a=None, pin_b=None):
        self.pin_a = pin_a or BTN_A_PIN
        self.pin_b = pin_b or BTN_B_PIN
        self.btn_a = None
        self.btn_b = None
        self.event = None

    def setup(self):
        self.btn_a = Button(self.pin_a, pull_up=True, bounce_time=0.001)
        self.btn_b = Button(self.pin_b, pull_up=True, bounce_time=0.001)

    def pressed(self):
        self.btn_a.when_pressed = self.setup_a
        self.btn_b.when_pressed = self.setup_b
        return self.event

    def setup_a(self):
        print("A pressed")
        self.event = True

    def setup_b(self):
        print("B pressed")
        self.event = False

class MexaRS(ReedSwitchInterface):
    def __init__(self, pin=None):
        self.pin = pin or DOOR_SENSOR_PIN
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

class RSFactory:
    @staticmethod
    def create(impulse: bool, **kwargs) -> ReedSwitchInterface:
        if impulse:
            return ImpulseRS(**kwargs)
        else:
            return MexaRS(**kwargs)
