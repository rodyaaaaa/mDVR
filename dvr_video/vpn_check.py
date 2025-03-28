import os
import time
from functools import partial

from pythonping import ping

from dvr_video.constants import VPN_DNS
from dvr_video.data.LoggerFactory import DefaultLoggerFactory

COUNT_PROBE = 3

logger = DefaultLoggerFactory.create_logger('mdvr_vpn_check', "cpn_check.log")


def probe_test(vpn_dns: str, timeout: int, count: int, verbose: bool) -> bool:
    return ping(vpn_dns, timeout=timeout, count=count, verbose=verbose).success()


def main():
    test_vpn = partial(probe_test, VPN_DNS, 5, 4, False)

    i = 0
    while True:
        is_success = test_vpn()

        if is_success:
            break

        if i == COUNT_PROBE:
            try:
                os.system("systemctl restart wg-quick@wg0")
                i = 0
            except OSError as e:
                logger.error(e)
                os.system("reboot")

        i += 1
        time.sleep(30)


if __name__ == "__main__":
    main()
