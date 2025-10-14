import time

import RPi.GPIO as GPIO


def setup_a(channel):
    print("A pressed")


def setup_b(channel):
    print("B pressed")

if __name__ == "__main__":
    pin_a = int(input("Setting up. Input pin_a: "))
    pin_b = int(input("Setting up. Input pin_b: "))

    GPIO.setmode(GPIO.BCM)
    GPIO.setup(pin_a, GPIO.IN, pull_up_down=GPIO.PUD_UP)
    GPIO.setup(pin_b, GPIO.IN, pull_up_down=GPIO.PUD_UP)
    GPIO.add_event_detect(pin_a, GPIO.FALLING, callback=setup_a, bouncetime=75)
    GPIO.add_event_detect(pin_b, GPIO.FALLING, callback=setup_b, bouncetime=75)
    while True:
        time.sleep(1)