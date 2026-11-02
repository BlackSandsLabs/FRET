"""Aggregates capture records into per-device state."""
from __future__ import annotations

import threading
import time
from collections import Counter, deque
from dataclasses import dataclass, field
from typing import Any

from . import parse
from .classify import CATEGORIES, classify
from .distance import estimate, ring_label
from .oui import OuiDb

RSSI_WINDOW_S = 30.0


@dataclass
class Device:
    medium: str  # "wifi" | "ble"
    mac: str
    first_seen: float
    last_seen: float = 0.0
    count: int = 0
    rssi: deque = field(default_factory=lambda: deque(maxlen=60))  # (t, rssi)
    channels: Counter = field(default_factory=Counter)
    kinds: Counter = field(default_factory=Counter)
    probed: set = field(default_factory=set)
    ssid_ap: str = ""
    bssids: set = field(default_factory=set)
    wps: dict = field(default_factory=dict)
    ble: dict = field(default_factory=dict)
    ble_addr: str = ""
    fingerprint: str = ""
    vendor_short: str = ""
    vendor_org: str = ""
    vendor_block: str = ""
    randomized: bool = False
    parent: str = ""
    note: str = ""
    flagged: bool = False
    dirty: bool = True
    _cache: dict = field(default_factory=dict)

    @property
    def key(self) -> str:
        return f"{self.medium}:{self.mac}"


class Tracker:
    def __init__(self, oui: OuiDb, settings: dict[str, Any]):
        self.oui = oui
        self.settings = settings
        self.devices: dict[str, Device] = {}
        self.lock = threading.RLock()
        self.self_macs: set[str] = set()
        self.total_records = 0

    # ------------------------------------------------------------------
    def ingest(self, rec: dict[str, Any], now: float | None = None) -> Device | None:
        t = rec.get("t")
        if t not in ("wifi", "ble"):
            return None
        mac = str(rec.get("mac", "")).upper()
        if len(mac) != 17 or mac in self.self_macs:
            return None
        now = now or time.time()
        with self.lock:
            self.total_records += 1
            key = f"{t}:{mac}"
            d = self.devices.get(key)
            if d is None:
                d = Device(medium=t, mac=mac, first_seen=now)
                self._identify(d, rec)
                self.devices[key] = d
            d.last_seen = now
            d.count += 1
            rssi = int(rec.get("rssi", -100))
            d.rssi.append((now, rssi))
            raw = parse.hex_to_bytes(rec.get("raw", ""))
            if t == "wifi":
                kind = rec.get("k", "data")
                d.kinds[kind] += 1
                if rec.get("ch"):
                    d.channels[int(rec["ch"])] += 1
                bssid = str(rec.get("bssid", "")).upper()
                if kind in ("data_sta", "assoc") and bssid and bssid != mac and bssid != "00:00:00:00:00:00":
                    d.bssids.add(bssid)
                if raw:
                    info = parse.parse_ies(raw)
                    if kind == "probe":
                        if info.get("ssid"):
                            d.probed.add(info["ssid"])
                        d.fingerprint = d.fingerprint or parse.wifi_fingerprint(info)
                    elif kind in ("beacon", "probe_resp") and "ssid" in info:
                        d.ssid_ap = info["ssid"] or "(hidden)"
                    if info.get("wps"):
                        d.wps.update(info["wps"])
            else:
                if raw:
                    info = parse.parse_ble_adv(raw)
                    if "services" in info:
                        info["services"] = sorted(set(d.ble.get("services", [])) | set(info["services"]))
                    d.ble.update(info)
            d.dirty = True
            return d

    def _identify(self, d: Device, rec: dict[str, Any]) -> None:
        if d.medium == "ble":
            d.ble_addr = parse.ble_addr_kind(d.mac, int(rec.get("at", 0)))
            d.randomized = d.ble_addr != "public"
        else:
            d.randomized = parse.is_locally_administered(d.mac)
        if not d.randomized:
            v = self.oui.lookup(d.mac)
            if v:
                d.vendor_short, d.vendor_org, d.vendor_block = v.short, v.org, v.block

    # ------------------------------------------------------------------
    def recent_rssi(self, d: Device, now: float) -> list[int]:
        vals = [r for (t, r) in d.rssi if now - t <= RSSI_WINDOW_S]
        return vals or [d.rssi[-1][1]] if d.rssi else []

    def _find_parent(self, d: Device) -> None:
        """Routers often broadcast extra networks from locally administered
        BSSIDs derived from their real MAC (e.g. B0:A7:B9:2A:65:97 ->
        D2:A7:B9:2A:65:97). Link those to the registered parent."""
        if d.medium != "wifi" or not d.randomized or d.parent:
            return
        if not (d.kinds.get("beacon") or d.kinds.get("probe_resp") or d.kinds.get("data_ap")):
            return
        mb = bytes.fromhex(d.mac.replace(":", ""))
        for o in list(self.devices.values()):
            if o.medium != "wifi" or o.randomized or not o.vendor_org:
                continue
            ob = bytes.fromhex(o.mac.replace(":", ""))
            if mb[1:5] == ob[1:5] and abs(mb[5] - ob[5]) <= 0x0F:
                d.parent = o.mac
                d.vendor_short, d.vendor_org, d.vendor_block = o.vendor_short, o.vendor_org, o.vendor_block
                d.dirty = True
                return

    def to_dict(self, d: Device, now: float) -> dict[str, Any]:
        self._find_parent(d)
        if d.dirty or not d._cache:
            v = classify({
                "medium": d.medium, "vendor_org": d.vendor_org, "randomized": d.randomized,
                "kinds": dict(d.kinds), "wps": d.wps, "ble": d.ble, "ssid_ap": d.ssid_ap,
                "probed": list(d.probed), "parent": d.parent,
            })
            d._cache = {"cat": v.category, "conf": v.confidence, "reasons": v.reasons,
                        "model": v.model, "model_src": v.model_source}
            d.dirty = False
        refs = self.settings.get("ref_1m", {})
        ref = refs.get(d.key) or refs.get(d.medium)
        rng = estimate(self.recent_rssi(d, now), d.medium, self.settings.get("environment", "indoor"),
                       ref_1m=ref, tx_power=d.ble.get("tx_power"))
        c = d._cache
        company = d.ble.get("company", "")
        if d.parent:
            make = f"{d.vendor_org} (virtual network of {d.parent})"
        elif d.randomized and company and not company.startswith("0x"):
            make = f"{company} (from BLE data)"
        elif d.randomized:
            make = "Randomised address"
        else:
            make = d.vendor_org or "Unknown vendor"
        return {
            "key": d.key, "medium": d.medium, "mac": d.mac,
            "make": make, "vendor_short": d.vendor_short, "vendor_block": d.vendor_block,
            "randomized": d.randomized, "ble_addr": d.ble_addr,
            "category": c["cat"], "category_label": CATEGORIES[c["cat"]], "confidence": c["conf"],
            "reasons": c["reasons"], "model": c["model"], "model_src": c["model_src"],
            "first_seen": d.first_seen, "last_seen": d.last_seen, "age": round(now - d.last_seen, 1),
            "count": d.count, "rssi_last": d.rssi[-1][1] if d.rssi else None,
            "rssi_hist": [r for (_, r) in list(d.rssi)[-30:]],
            "range": rng.as_dict() if rng else None, "ring": ring_label(rng),
            "channels": sorted(d.channels), "kinds": dict(d.kinds),
            "probed": sorted(d.probed), "ssid_ap": d.ssid_ap, "bssids": sorted(d.bssids),
            "wps": d.wps, "ble": d.ble, "fingerprint": d.fingerprint,
            "note": d.note, "flagged": d.flagged, "parent": d.parent,
        }

    def snapshot(self, max_age: float | None = None) -> list[dict[str, Any]]:
        now = time.time()
        with self.lock:
            devs = [d for d in self.devices.values() if max_age is None or now - d.last_seen <= max_age]
            out = [self.to_dict(d, now) for d in devs]
        # group randomised Wi-Fi addresses sharing a probe fingerprint
        groups: dict[str, list[str]] = {}
        for o in out:
            if o["medium"] == "wifi" and o["randomized"] and o["fingerprint"]:
                groups.setdefault(o["fingerprint"], []).append(o["mac"])
        for o in out:
            g = groups.get(o["fingerprint"]) if o["fingerprint"] else None
            o["linked"] = [m for m in g if m != o["mac"]] if g and len(g) > 1 else []
        return out

    def annotate(self, key: str, note: str | None = None, flagged: bool | None = None) -> None:
        with self.lock:
            d = self.devices.get(key)
            if d:
                if note is not None:
                    d.note = note
                if flagged is not None:
                    d.flagged = flagged

    def clear(self) -> None:
        with self.lock:
            self.devices.clear()
            self.total_records = 0
