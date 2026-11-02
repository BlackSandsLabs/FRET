"""Records the stick's start-up output to boot_log.txt (for troubleshooting)."""
import sys
import time

import serial
from serial.tools import list_ports

VIDS = {0x1A86, 0x10C4, 0x0403, 0x303A}
port = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else None
if not port:
    found = [p for p in list_ports.comports() if p.vid in VIDS]
    for p in list_ports.comports():
        print(" ", p.device, "-", p.description)
    if not found:
        print("No stick found. Check the USB-C cable.")
        sys.exit(1)
    port = found[0].device
print("Recording from", port, "for about 25 seconds...")
with open("boot_log.txt", "wb") as out:
    for baud in (115200, 921600):
        s = serial.Serial()
        s.port, s.baudrate, s.timeout = port, baud, 0.2
        s.dtr = False
        s.rts = False
        s.open()
        s.rts = True   # pulse reset so we catch the boot messages
        time.sleep(0.15)
        s.rts = False
        out.write(f"\n===== {baud} baud =====\n".encode())
        t = time.time()
        while time.time() - t < 12:
            out.write(s.read(4096))
        s.close()
print("Saved boot_log.txt - tell Claude it's ready.")
