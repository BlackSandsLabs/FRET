"""Decoding of the raw bytes the StickS3 forwards.

* 802.11 tagged parameters (information elements) from probe requests,
  beacons, probe responses and association requests.
* Wi-Fi Protected Setup (WPS) attributes, which frequently carry the
  manufacturer, model name and model number of cameras, printers and routers.
* Bluetooth LE advertising payloads (AD structures).

Everything here is pure and side-effect free so it can be unit tested.
"""
from __future__ import annotations

import hashlib
import struct
from typing import Any

# --------------------------------------------------------------------------
# 802.11 information elements
# --------------------------------------------------------------------------
WPS_ATTRS = {
    0x1021: "manufacturer",
    0x1023: "model_name",
    0x1024: "model_number",
    0x1011: "device_name",
    0x1042: "serial_number",
}

WPS_CATEGORIES = {
    1: "Computer", 2: "Input device", 3: "Printer/Scanner", 4: "Camera",
    5: "Storage", 6: "Network infrastructure", 7: "Display", 8: "Multimedia device",
    9: "Gaming device", 10: "Telephone", 11: "Audio device", 12: "Docking device",
}


def _clean(b: bytes) -> str:
    s = b.decode("utf-8", errors="replace")
    return "".join(ch for ch in s if ch.isprintable()).strip()


def parse_wps(data: bytes) -> dict[str, Any]:
    out: dict[str, Any] = {}
    i = 0
    while i + 4 <= len(data):
        t, ln = struct.unpack(">HH", data[i:i + 4])
        v = data[i + 4:i + 4 + ln]
        i += 4 + ln
        if t in WPS_ATTRS:
            s = _clean(v)
            if s:
                out[WPS_ATTRS[t]] = s
        elif t == 0x1054 and len(v) >= 8:  # primary device type
            cat = struct.unpack(">H", v[0:2])[0]
            if cat in WPS_CATEGORIES:
                out["device_category"] = WPS_CATEGORIES[cat]
    return out


def parse_ies(raw: bytes) -> dict[str, Any]:
    """Parse a run of 802.11 tagged parameters."""
    info: dict[str, Any] = {"tags": []}
    vendor_ouis: list[str] = []
    i = 0
    while i + 2 <= len(raw):
        tid, ln = raw[i], raw[i + 1]
        val = raw[i + 2:i + 2 + ln]
        if len(val) < ln:  # truncated by the 240-byte capture limit
            break
        info["tags"].append(tid)
        if tid == 0:
            if ln == 0 or all(b == 0 for b in val):
                info["ssid"] = ""  # wildcard / hidden
            else:
                info["ssid"] = _clean(val)
        elif tid == 1 or tid == 50:
            info.setdefault("rates", []).extend(round((b & 0x7F) * 0.5, 1) for b in val)
        elif tid == 3 and ln >= 1:
            info["ds_channel"] = val[0]
        elif tid == 45:
            info["ht"] = True
        elif tid == 191:
            info["vht"] = True
        elif tid == 255 and ln >= 1 and val[0] == 35:
            info["he"] = True  # Wi-Fi 6
        elif tid == 48:
            info["rsn"] = True
        elif tid == 221 and ln >= 4:
            oui = val[0:3].hex().upper()
            vtype = val[3]
            vendor_ouis.append(f"{oui}:{vtype:02X}")
            if oui == "0050F2" and vtype == 0x04:
                info["wps"] = {**info.get("wps", {}), **parse_wps(val[4:])}
        i += 2 + ln
    if vendor_ouis:
        info["vendor_ies"] = vendor_ouis
    return info


def wifi_fingerprint(info: dict[str, Any]) -> str:
    """Stable-ish signature of a probe request's capabilities.

    Devices that randomise their MAC address usually keep the same set and
    order of information elements, so equal fingerprints suggest (but do not
    prove) that two random addresses belong to the same handset.
    """
    parts = [",".join(str(t) for t in info.get("tags", []) if t != 0)]
    parts.append(",".join(str(r) for r in info.get("rates", [])))
    parts.append(",".join(sorted(info.get("vendor_ies", []))))
    parts.append("ht" if info.get("ht") else "")
    parts.append("vht" if info.get("vht") else "")
    parts.append("he" if info.get("he") else "")
    return hashlib.sha1("|".join(parts).encode()).hexdigest()[:10]


# --------------------------------------------------------------------------
# Bluetooth LE advertising payloads
# --------------------------------------------------------------------------
# Bluetooth SIG company identifiers (assigned numbers) used for hints
BLE_COMPANIES = {
    0x004C: "Apple",
    0x0006: "Microsoft",
    0x0075: "Samsung",
    0x00E0: "Google",
    0x0087: "Garmin",
    0x009E: "Bose",
    0x012D: "Sony",
}

# Apple Continuity message types (first byte of Apple manufacturer data)
APPLE_TYPES = {
    0x02: "iBeacon",
    0x05: "AirDrop",
    0x07: "AirPods / Beats (proximity pairing)",
    0x09: "AirPlay target",
    0x0C: "Handoff",
    0x0F: "Nearby Action",
    0x10: "Nearby Info (iPhone / iPad / Mac / Watch)",
    0x12: "Find My network",
}

BLE_SERVICES = {
    0xFE2C: "Google Fast Pair",
    0xFD6F: "Exposure Notification",
    0xFEAA: "Eddystone beacon",
    0x180F: "Battery",
    0x180D: "Heart rate",
    0x1812: "HID",
}

APPEARANCE_CATEGORIES = {
    1: "Phone", 2: "Computer", 3: "Watch", 4: "Clock", 5: "Display",
    6: "Remote control", 7: "Eye-glasses", 8: "Tag", 9: "Keyring",
    10: "Media player", 11: "Barcode scanner", 12: "Thermometer",
    13: "Heart rate sensor", 14: "Blood pressure", 15: "HID device",
    33: "Audio sink", 34: "Audio source",
}


def parse_ble_adv(raw: bytes) -> dict[str, Any]:
    out: dict[str, Any] = {}
    services: list[str] = []
    i = 0
    while i < len(raw):
        ln = raw[i]
        if ln == 0 or i + 1 + ln > len(raw):
            break
        t = raw[i + 1]
        d = raw[i + 2:i + 1 + ln]
        i += 1 + ln
        if t in (0x08, 0x09):
            name = _clean(d)
            if name and (t == 0x09 or "name" not in out):
                out["name"] = name
        elif t == 0x0A and len(d) >= 1:
            out["tx_power"] = struct.unpack("b", d[:1])[0]
        elif t == 0x19 and len(d) >= 2:
            val = struct.unpack("<H", d[:2])[0]
            out["appearance"] = APPEARANCE_CATEGORIES.get(val >> 6, f"0x{val:04X}")
        elif t in (0x02, 0x03):
            for j in range(0, len(d) - 1, 2):
                u = struct.unpack("<H", d[j:j + 2])[0]
                services.append(BLE_SERVICES.get(u, f"0x{u:04X}"))
        elif t == 0x16 and len(d) >= 2:
            u = struct.unpack("<H", d[:2])[0]
            services.append(BLE_SERVICES.get(u, f"0x{u:04X}"))
        elif t == 0xFF and len(d) >= 2:
            cid = struct.unpack("<H", d[:2])[0]
            out["company_id"] = cid
            out["company"] = BLE_COMPANIES.get(cid, f"0x{cid:04X}")
            if cid == 0x004C and len(d) >= 3:
                out["apple_type"] = APPLE_TYPES.get(d[2], f"type 0x{d[2]:02X}")
            if cid == 0x0006 and len(d) >= 3 and d[2] == 0x01:
                out["ms_cdp"] = True  # Microsoft Connected Devices Platform beacon
    if services:
        out["services"] = sorted(set(services))
    return out


def ble_addr_kind(mac: str, addr_type: int) -> str:
    """Classify a BLE address. addr_type: 0 public, 1 random (NimBLE)."""
    if addr_type == 0:
        return "public"
    top = int(mac[0:2], 16) >> 6
    return {0b11: "random static", 0b01: "resolvable private", 0b00: "non-resolvable"}.get(top, "random")


def is_locally_administered(mac: str) -> bool:
    return bool(int(mac[0:2], 16) & 0x02)


def hex_to_bytes(h: str) -> bytes:
    try:
        return bytes.fromhex(h or "")
    except ValueError:
        return b""
