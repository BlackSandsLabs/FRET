"""Capture sources: an M5StickC Plus2 / StickS3 receiver over USB serial, or a built-in demo."""
from __future__ import annotations

import json
import math
import random
import struct
import threading
import time
from typing import Any, Callable

Callback = Callable[[dict[str, Any]], None]

ESPRESSIF_VID = 0x303A
USB_SERIAL_VIDS = {0x1A86, 0x10C4, 0x0403}  # WCH CH9102/CH340, Silicon Labs CP210x, FTDI
BAUD = 921600
WCH_VID = 0x1A86  # CH9102 on the M5StickC Plus2

# Supported receivers: id -> (display name, preferred USB vendor IDs)
RECEIVERS = {
    "plus2": ("M5StickC Plus2", {WCH_VID}),
    "sticks3": ("M5Stack StickS3", {ESPRESSIF_VID}),
}


def board_hint(vid: int | None) -> str:
    if vid == ESPRESSIF_VID:
        return "sticks3"
    if vid == WCH_VID:
        return "plus2"
    return ""


def list_ports(prefer: str = "auto") -> list[dict[str, Any]]:
    try:
        from serial.tools import list_ports as lp
    except ImportError:
        return []
    out = []
    for p in lp.comports():
        hint = board_hint(p.vid)
        out.append({
            "device": p.device, "description": p.description or "",
            "likely": bool(p.vid == ESPRESSIF_VID or p.vid in USB_SERIAL_VIDS or "ESP32" in (p.description or "").upper()),
            "board": hint, "board_name": RECEIVERS[hint][0] if hint else "",
        })
    out.sort(key=lambda x: (not (prefer != "auto" and x["board"] == prefer), not x["board"], not x["likely"]))
    return out


class Source:
    name = "none"

    def __init__(self, cb: Callback):
        self.cb = cb
        self.running = False
        self.connected = False
        self.status: dict[str, Any] = {}
        self.hello: dict[str, Any] = {}
        self.error = ""
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self.running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self.running = False

    def send(self, cmd: str) -> None:  # pragma: no cover - overridden
        pass

    def _run(self) -> None:  # pragma: no cover - overridden
        raise NotImplementedError

    def _handle(self, rec: dict[str, Any]) -> None:
        t = rec.get("t")
        if t == "hello":
            self.hello = rec
        elif t == "stat":
            self.status = rec
        self.cb(rec)


class SerialSource(Source):
    name = "serial"

    def __init__(self, cb: Callback, port: str | None = None, prefer: str = "auto"):
        super().__init__(cb)
        self.port = port
        self.prefer = prefer
        self._ser = None
        self._wlock = threading.Lock()

    def send(self, cmd: str) -> None:
        with self._wlock:
            if self._ser:
                try:
                    self._ser.write((cmd.strip() + "\n").encode())
                except Exception:
                    pass

    def _pick_port(self) -> str | None:
        if self.port:
            return self.port
        ports = list_ports(self.prefer)
        if self.prefer != "auto":
            match = [p for p in ports if p["board"] == self.prefer]
            if match:
                return match[0]["device"]
        likely = [p for p in ports if p["likely"]]
        return likely[0]["device"] if likely else None

    def _run(self) -> None:
        try:
            import serial  # pyserial
        except ImportError:
            self.connected = False
            self.error = "pyserial is missing - close FRET and run app\\setup_windows.bat"
            return

        while self.running:
            port = self._pick_port()
            if not port:
                want = RECEIVERS[self.prefer][0] if self.prefer in RECEIVERS else "M5StickC Plus2 / StickS3"
                self.connected, self.error = False, f"{want} not found - plug the stick in with a data USB-C cable"
                time.sleep(1.5)
                continue
            try:
                with serial.Serial(port, BAUD, timeout=0.5) as ser:
                    self._ser = ser
                    self.connected, self.error = True, ""
                    self.send("PING")
                    buf = b""
                    while self.running:
                        chunk = ser.read(4096)
                        if not chunk:
                            continue
                        buf += chunk
                        while b"\n" in buf:
                            line, buf = buf.split(b"\n", 1)
                            line = line.strip()
                            if not line.startswith(b"{"):
                                continue
                            try:
                                self._handle(json.loads(line))
                            except ValueError:
                                pass
            except Exception as e:  # unplugged, port busy, etc.
                self.error = f"{port}: {e}"
            finally:
                self._ser = None
                self.connected = False
            time.sleep(1.0)


# --------------------------------------------------------------------------
# Demo source: synthesises realistic frames so the app can be explored and
# tested without hardware. Frames are built byte-for-byte like real captures.
# --------------------------------------------------------------------------
def _ie(tid: int, data: bytes) -> bytes:
    return bytes([tid, len(data)]) + data


def _wps(manufacturer: str, model: str, number: str, category: int, dev_name: str = "") -> bytes:
    def a(t: int, v: bytes) -> bytes:
        return struct.pack(">HH", t, len(v)) + v
    body = a(0x104A, b"\x10") + a(0x1021, manufacturer.encode()) + a(0x1023, model.encode())
    body += (a(0x1024, number.encode()) if number else b"") + a(0x1054, struct.pack(">H", category) + b"\x00\x50\xf2\x04" + b"\x00\x01")
    if dev_name:
        body += a(0x1011, dev_name.encode())
    return _ie(221, b"\x00\x50\xf2\x04" + body)


RATES = _ie(1, bytes([0x82, 0x84, 0x8B, 0x96, 0x0C, 0x12, 0x18, 0x24])) + _ie(50, bytes([0x30, 0x48, 0x60, 0x6C]))
HT = _ie(45, bytes(26))


def _beacon_ies(ssid: str, ch: int, extra: bytes = b"") -> bytes:
    return _ie(0, ssid.encode()) + RATES + _ie(3, bytes([ch])) + HT + _ie(48, bytes(20)) + extra


def _probe_ies(ssid: str = "", vendor: bytes = b"") -> bytes:
    return _ie(0, ssid.encode()) + RATES + HT + _ie(191, bytes(12)) + vendor


def _ad(t: int, d: bytes) -> bytes:
    return bytes([len(d) + 1, t]) + d


class DemoSource(Source):
    name = "demo"

    def __init__(self, cb: Callback, oui=None, seed: int = 7):
        super().__init__(cb)
        self.rng = random.Random(seed)
        self.oui = oui
        self.channel = 1
        self.devices = self._scenario()
        self.hello = {"t": "hello", "fw": "DEMO", "board": "Simulated receiver", "self": "DE:MO:00:00:00:00"}

    def _mac(self, pattern: str | None, randomized: bool = False) -> str:
        r = self.rng
        if randomized or not pattern or not self.oui:
            first = (r.randrange(256) & 0xFC) | 0x02
            octs = [first] + [r.randrange(256) for _ in range(5)]
        else:
            prefixes = sorted(self.oui.prefixes_for(pattern))
            p = r.choice(prefixes) if prefixes else "001122"
            octs = [int(p[i:i + 2], 16) for i in (0, 2, 4)] + [r.randrange(256) for _ in range(3)]
        return ":".join(f"{o:02X}" for o in octs)

    def _scenario(self) -> list[dict[str, Any]]:
        apple_nearby = _ad(0x01, b"\x1a") + _ad(0xFF, b"\x4c\x00\x10\x05\x01\x18\x44\x2a\x9c")
        airpods = _ad(0xFF, b"\x4c\x00\x07\x19\x01\x0e\x20\x2b\x99\x8f\x11\x00\x05")
        findmy = _ad(0xFF, b"\x4c\x00\x12\x19\x10" + bytes(22))
        ms_cdp = _ad(0xFF, b"\x06\x00\x01\x09\x20\x02" + bytes(10))
        galaxy = _ad(0x01, b"\x1a") + _ad(0xFF, b"\x75\x00\x01\x00\x02\x00\x01\x01\xff")
        buds = _ad(0x09, b"Galaxy Buds2 Pro") + _ad(0x0A, b"\xf4")
        watch = _ad(0x09, b"Forerunner 265") + _ad(0x19, struct.pack("<H", 3 << 6)) + _ad(0xFF, b"\x87\x00\x01")
        fastpair = _ad(0x16, b"\x2c\xfe\x00\x00\x00") + _ad(0x09, b"WH-1000XM5")
        ph = "Home-5G"
        d = [
            # CCTV
            dict(m="wifi", mac=self._mac(r"hikvision"), dist=6, kinds=["beacon", "data_ap"], ch=6,
                 ies=_beacon_ies("HIK-IPC-4F2A", 6, _wps("Hikvision", "DS-2CD2143G2-I", "", 4))),
            dict(m="wifi", mac=self._mac(r"dahua"), dist=14, kinds=["data_sta"], ch=11, bssid_of=ph),
            dict(m="wifi", mac=self._mac(r"axis communications"), dist=22, kinds=["data_sta", "probe"], ch=1,
                 ies=_probe_ies("", _wps("AXIS", "P3265-LVE", "10.12", 4))),
            dict(m="wifi", mac=self._mac(r"hangzhou ezviz|ezviz"), dist=4, kinds=["beacon"], ch=6,
                 ies=_beacon_ies("EZVIZ_C6N_D41", 6)),
            # Phones
            dict(m="wifi", mac=self._mac(None, True), dist=3, kinds=["probe"], ch=1, ies=_probe_ies("", _ie(221, b"\x00\x17\xf2\x0a\x00\x01\x04\x00\x00\x00\x00")), group="iphone"),
            dict(m="wifi", mac=self._mac(None, True), dist=3, kinds=["probe"], ch=6, ies=_probe_ies("", _ie(221, b"\x00\x17\xf2\x0a\x00\x01\x04\x00\x00\x00\x00")), group="iphone"),
            dict(m="ble", mac=self._mac(None, True), at=1, dist=3, adv=apple_nearby),
            dict(m="wifi", mac=self._mac(None, True), dist=9, kinds=["probe"], ch=11, ies=_probe_ies("CafeWiFi")),
            dict(m="ble", mac=self._mac(None, True), at=1, dist=9, adv=galaxy),
            dict(m="wifi", mac=self._mac(r"samsung electronics"), dist=12, kinds=["data_sta"], ch=11, bssid_of=ph),
            dict(m="wifi", mac=self._mac(r"xiaomi"), dist=18, kinds=["probe", "data_sta"], ch=1, ies=_probe_ies("Redmi-Hotspot")),
            # Computers
            dict(m="wifi", mac=self._mac(r"intel corporate"), dist=5, kinds=["data_sta", "probe"], ch=6, bssid_of=ph, ies=_probe_ies(ph)),
            dict(m="ble", mac=self._mac(None, True), at=1, dist=5, adv=ms_cdp),
            dict(m="wifi", mac=self._mac(r"azurewave|liteon"), dist=16, kinds=["data_sta"], ch=11, bssid_of=ph),
            # Wearables / audio
            dict(m="ble", mac=self._mac(None, True), at=1, dist=2, adv=airpods),
            dict(m="ble", mac=self._mac(r"samsung electronics"), at=0, dist=7, adv=buds),
            dict(m="ble", mac=self._mac(r"garmin"), at=0, dist=11, adv=watch),
            dict(m="ble", mac=self._mac(None, True), at=1, dist=13, adv=fastpair),
            dict(m="ble", mac=self._mac(None, True), at=1, dist=25, adv=findmy),
            # Infrastructure / IoT
            dict(m="wifi", mac=self._mac(r"tp-link"), dist=10, kinds=["beacon", "data_ap"], ch=6, ies=_beacon_ies(ph, 6), name=ph),
            dict(m="wifi", mac=self._mac(r"espressif"), dist=8, kinds=["data_sta"], ch=6, bssid_of=ph),
            dict(m="wifi", mac=self._mac(r"ring llc|amazon technologies"), dist=19, kinds=["data_sta"], ch=11, bssid_of=ph),
        ]
        names = {x.get("name"): x["mac"] for x in d if x.get("name")}
        for x in d:
            x["bssid"] = names.get(x.get("bssid_of"), "00:00:00:00:00:00")
            x["phase"] = self.rng.random() * 6.28
            x["rate"] = self.rng.uniform(0.4, 2.5)
        return d

    def _rssi(self, x: dict[str, Any], t: float) -> int:
        ref = -40 if x["m"] == "wifi" else -59
        dist = x["dist"] * (1 + 0.15 * math.sin(t / 20 + x["phase"]))
        return int(ref - 10 * 2.8 * math.log10(max(dist, 0.3)) + self.rng.gauss(0, 3))

    def _run(self) -> None:
        self.connected = True
        start = time.time()
        last_stat = 0.0
        while self.running:
            t = time.time() - start
            self.channel = self.channel % 13 + 1
            for x in self.devices:
                if self.rng.random() > x["rate"] * 0.25:
                    continue
                rec: dict[str, Any] = {"t": x["m"], "mac": x["mac"], "rssi": self._rssi(x, t), "ms": int(t * 1000)}
                if x["m"] == "wifi":
                    k = self.rng.choice(x["kinds"])
                    rec.update(k=k, ch=x["ch"], bssid=x["bssid"] if k.startswith("data_sta") else x["mac"])
                    rec["raw"] = x.get("ies", b"").hex() if k in ("probe", "beacon", "probe_resp") else ""
                else:
                    rec.update(at=x["at"], raw=x["adv"].hex())
                self._handle(rec)
            if t - last_stat >= 1:
                last_stat = t
                self._handle({"t": "stat", "ch": self.channel, "hop": True, "dwell": 250, "wifi": True,
                              "ble": True, "wfps": round(self.rng.uniform(60, 140), 1),
                              "bleps": round(self.rng.uniform(20, 60), 1), "drop": 0, "bat": 87, "up": int(t)})
            time.sleep(0.25)
