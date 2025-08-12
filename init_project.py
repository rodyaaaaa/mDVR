import asyncio
import logging
import os
from datetime import datetime
import subprocess

from dvr_video.data.constants import LOG_DIR
from dvr_video.data.utils import get_ext5v_v


def get_logger(log_dir: str):
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)
    class SingleFileHandler(logging.Handler):
        def emit(self, record):
            log_time = datetime.now().strftime("%Y-%m-%d_%H_%M_%S")
            log_filename = os.path.join(log_dir, f"start.log.{log_time}")
            with open(log_filename, "w", encoding="utf-8") as f:
                f.write(self.format(record) + "\n")
    logger = logging.getLogger("single_file_logger")
    logger.setLevel(logging.INFO)
    logger.handlers = []
    handler = SingleFileHandler()
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    return logger


def _run_cmd(cmd: list[str]) -> tuple[int, str, str]:
    """Run a shell command and return (rc, stdout, stderr)."""
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=False)
        return res.returncode, (res.stdout or "").strip(), (res.stderr or "").strip()
    except Exception as e:
        return 1, "", str(e)


def enable_ip_forwarding(logger: logging.Logger) -> None:
    """Ensure net.ipv4.ip_forward=1 in runtime and persisted in /etc/sysctl.conf.

    Requires root privileges to modify system settings.
    """
    try:
        # Check runtime value first
        with open("/proc/sys/net/ipv4/ip_forward", "r", encoding="utf-8") as f:
            current = f.read().strip()
    except Exception:
        current = "0"

    if current != "1":
        rc, out, err = _run_cmd(["sysctl", "-w", "net.ipv4.ip_forward=1"])
        if rc != 0:
            logger.error(f"Failed to enable IP forwarding at runtime: {err or out}")

    # Ensure persistence in /etc/sysctl.conf
    try:
        conf_path = "/etc/sysctl.conf"
        lines: list[str] = []
        if os.path.exists(conf_path):
            with open(conf_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
        key = "net.ipv4.ip_forward"
        value_line = f"{key}=1\n"

        found = False
        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped.startswith(key):
                lines[i] = value_line
                found = True
                break
        if not found:
            lines.append("\n" if lines and not lines[-1].endswith("\n") else "")
            lines.append(value_line)

        with open(conf_path, "w", encoding="utf-8") as f:
            f.writelines(lines)
        rc, out, err = _run_cmd(["sysctl", "-p"])
        if rc != 0:
            logger.error(f"Failed to apply sysctl -p: {err or out}")
    except Exception as e:
        logger.error(f"Error updating /etc/sysctl.conf: {e}")


def _iptables_has(rule_args: list[str], table: str | None = None) -> bool:
    """Check rule existence using `iptables -C`.

    Example: _iptables_has(["FORWARD","-i","eth0","-o","eth1","-j","ACCEPT"])
             _iptables_has(["POSTROUTING","-o","eth1","-j","MASQUERADE"], table="nat")
    """
    cmd = ["iptables"]
    if table:
        cmd += ["-t", table]
    cmd += ["-C"] + rule_args
    rc, out, err = _run_cmd(cmd)
    return rc == 0


def ensure_iptables_forwarding(logger: logging.Logger, in_if: str = "eth1", out_if: str = "eth0") -> None:
    """Ensure forwarding and NAT between in_if and out_if.

    Rules ensured:
      - FORWARD: in_if -> out_if ACCEPT
      - FORWARD: out_if -> in_if ESTABLISHED,RELATED ACCEPT
      - nat POSTROUTING: out_if MASQUERADE
    """
    # 1) FORWARD allow from in_if to out_if
    rule1 = ["FORWARD", "-i", in_if, "-o", out_if, "-j", "ACCEPT"]
    if not _iptables_has(rule1):
        rc, out, err = _run_cmd(["iptables", "-A"] + rule1)
        if rc != 0:
            logger.error(f"Failed to add rule: FORWARD -i {in_if} -o {out_if} -j ACCEPT | {err or out}")

    # 2) FORWARD allow established/related back
    # Try both state orders to detect existing rule regardless of print order
    rule2_a = ["FORWARD", "-i", out_if, "-o", in_if, "-m", "state", "--state", "ESTABLISHED,RELATED", "-j", "ACCEPT"]
    if not (_iptables_has(rule2_a)):
        rc, out, err = _run_cmd(["iptables", "-A"] + rule2_a)
        if rc != 0:
            logger.error(
                f"Failed to add rule: FORWARD -i {out_if} -o {in_if} -m state --state ESTABLISHED,RELATED -j ACCEPT | {err or out}"
            )

    # 3) NAT MASQUERADE on out_if
    rule3 = ["POSTROUTING", "-o", out_if, "-j", "MASQUERADE"]
    if not _iptables_has(rule3, table="nat"):
        rc, out, err = _run_cmd(["iptables", "-t", "nat", "-A"] + rule3)
        if rc != 0:
            logger.error(
                f"Failed to add rule: -t nat POSTROUTING -o {out_if} -j MASQUERADE | {err or out}"
            )


async def main():
    log_dir = os.path.join(LOG_DIR, "mdvr_start")
    logger = get_logger(log_dir)
    ext5v_v = get_ext5v_v()
    print(ext5v_v)
    logger.info(f"Start system | EXT5V_V: {ext5v_v}")
    enable_ip_forwarding(logger)
    ensure_iptables_forwarding(logger, in_if="eth0", out_if="eth1")


if __name__ == "__main__":
    asyncio.run(main())
