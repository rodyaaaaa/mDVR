import time

import RPi.GPIO as GPIO


if __name__ == "__main__":
    pin = int(input("Setting up. Input pin: "))
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)

    while True:
        event = GPIO.input(pin)
        if event == GPIO.HIGH:
            print("Open")
        elif event != GPIO.HIGH:
            print("Closed")

        time.sleep(0.5)