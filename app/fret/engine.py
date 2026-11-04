"""Ties sources, tracker, case log and settings together; exposes the UI API."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from typing import Any

from . import __version__
from .case import Case
from .distance import calibrate_ref
from .oui import OuiDb
from .paths import cases_dir, data_dir
from .sources import RECEIVERS, DemoSource, SerialSource, Source, list_ports
from .tracker import Tracker

DEFAULT_SETTINGS: dict[str, Any] = {
    "environment": "indoor",
    "ref_1m": {"wifi": -40.0, "ble": -59.0},
    "receiver": "auto",
    "dwell_ms": 250,
    "ble_active": False,
    "stale_after_s": 120,
    "show_stale": False,
    "examiner": "",
    "agency": "",
}


class Engine:
    def __init__(self, demo: bool = False, port: str | None = None):
        self.settings_path = data_dir() / "settings.json"
        self.settings = json.loads(json.dumps(DEFAULT_SETTINGS))
        try:
            saved = json.loads(self.settings_path.read_text())
            self.settings.update(saved)
        except Exception:
            pass
        self.oui = OuiDb()
        self.tracker = Tracker(self.oui, self.settings)
        self.case: Case | None = None
        self.source: Source | None = None
        self.started = time.time()
        self.toast = ""
        self.selection = "auto"
        self._flusher = threading.Thread(target=self._flush_loop, daemon=True)
        self._flusher.start()
        self.use_source("demo" if demo else (port or "auto"))

    # ------------------------------------------------------------------ internals
    def _on_record(self, rec: dict[str, Any]) -> None:
        if rec.get("t") == "hello" and rec.get("self"):
            self.tracker.self_macs.add(str(rec["self"]).upper())
            if self.source and self.source.name == "serial":
                self.source.send(f"DWELL {int(self.settings.get('dwell_ms', 250))}")
                self.source.send("BLE ACTIVE" if self.settings.get("ble_active") else "BLE PASSIVE")
        self.tracker.ingest(rec)
        if self.case:
            self.case.log(rec)

    def _flush_loop(self) -> None:
        while True:
            time.sleep(1.0)
            c = self.case
            if c:
                try:
                    c.flush()
                except Exception:
                    pass

    def _save_settings(self) -> None:
        try:
            self.settings_path.write_text(json.dumps(self.settings, indent=2))
        except Exception:
            pass

    # ------------------------------------------------------------------ API (called from the UI)
    def get_state(self) -> dict[str, Any]:
        s = self.source
        stale = self.settings.get("stale_after_s", 120)
        devices = self.tracker.snapshot(None if self.settings.get("show_stale") else stale)
        counts: dict[str, int] = {}
        for d in devices:
            counts[d["category"]] = counts.get(d["category"], 0) + 1
        return {
            "version": __version__,
            "source": {
                "kind": s.name if s else "none", "connected": bool(s and s.connected),
                "error": s.error if s else "", "hello": s.hello if s else {}, "status": s.status if s else {},
                "selection": self.selection,
            },
            "receivers": {k: v[0] for k, v in RECEIVERS.items()},
            "devices": devices,
            "counts": counts,
            "total_records": self.tracker.total_records,
            "case": None if not self.case else {
                "info": self.case.info, "folder": str(self.case.folder), "started": self.case.started,
                "observations": self.case.obs_count,
            },
            "settings": self.settings,
            "oui_entries": len(self.oui),
            "oui_path": str(self.oui.path),
            "uptime": round(time.time() - self.started),
            "toast": self._take_toast(),
        }

    def _take_toast(self) -> str:
        t, self.toast = self.toast, ""
        return t

    def list_ports(self) -> list[dict[str, Any]]:
        return list_ports(self.settings.get("receiver", "auto"))

    def use_source(self, which: str) -> dict[str, Any]:
        if self.source:
            self.source.stop()
        self.tracker.clear()
        self.selection = which
        if which == "demo":
            self.source = DemoSource(self._on_record, oui=self.oui)
        else:
            self.source = SerialSource(self._on_record, None if which == "auto" else which,
                                       prefer=self.settings.get("receiver", "auto"))
        self.source.start()
        if self.case:
            self.case.audit("source_changed", which)
        return {"ok": True}

    def send_command(self, cmd: str) -> dict[str, Any]:
        if self.source:
            self.source.send(cmd)
        if self.case:
            self.case.audit("receiver_command", cmd)
        return {"ok": True}

    def start_case(self, info: dict[str, str]) -> dict[str, Any]:
        if self.case:
            return {"ok": False, "error": "A case is already open"}
        if not (info.get("reference") or "").strip():
            return {"ok": False, "error": "Case reference is required"}
        for k in ("examiner", "agency"):
            if info.get(k):
                self.settings[k] = info[k]
        self._save_settings()
        self.case = Case(info)
        s = self.source
        self.case.audit("receiver", json.dumps({"source": s.name if s else None, "hello": s.hello if s else {}}))
        self.case.audit("settings", json.dumps(self.settings))
        self.toast = f"Case {info['reference']} opened - logging all observations"
        return {"ok": True, "folder": str(self.case.folder)}

    def end_case(self) -> dict[str, Any]:
        if not self.case:
            return {"ok": False, "error": "No case open"}
        res = self.export()
        self.case.close()
        folder = str(self.case.folder)
        self.case = None
        self.toast = "Case closed and exported"
        return {"ok": True, "folder": folder, "export": res}

    def export(self) -> dict[str, Any]:
        if not self.case:
            return {"ok": False, "error": "Open a case first - exports are tied to a case log"}
        res = self.case.export(self.tracker.snapshot(None), self.settings)
        self.toast = "Export written and hashed"
        return {"ok": True, **res}

    def annotate(self, key: str, note: str | None = None, flagged: bool | None = None) -> dict[str, Any]:
        self.tracker.annotate(key, note, flagged)
        if self.case:
            self.case.audit("annotate", json.dumps({"device": key, "note": note, "flagged": flagged}))
        return {"ok": True}

    def set_setting(self, key: str, value: Any) -> dict[str, Any]:
        if key not in DEFAULT_SETTINGS:
            return {"ok": False, "error": f"Unknown setting {key}"}
        self.settings[key] = value
        self._save_settings()
        if key == "dwell_ms":
            self.send_command(f"DWELL {int(value)}")
        if key == "ble_active":
            self.send_command("BLE ACTIVE" if value else "BLE PASSIVE")
        if key == "receiver" and self.selection == "auto":
            self.use_source("auto")  # re-detect using the chosen model
        for d in self.tracker.devices.values():
            d.dirty = True
        if self.case:
            self.case.audit("setting", json.dumps({key: value}))
        return {"ok": True}

    def calibrate(self, key: str, distance_m: float = 1.0) -> dict[str, Any]:
        d = self.tracker.devices.get(key)
        if not d or len(d.rssi) < 5:
            return {"ok": False, "error": "Need at least 5 recent readings from that device"}
        ref = round(calibrate_ref(self.tracker.recent_rssi(d, time.time()), distance_m), 1)
        self.settings.setdefault("ref_1m", {})[d.medium] = ref
        self._save_settings()
        if self.case:
            self.case.audit("calibrate", json.dumps({"device": key, "distance_m": distance_m, "ref_1m": ref}))
        self.toast = f"{d.medium.upper()} reference set to {ref} dBm at 1 m"
        return {"ok": True, "ref_1m": ref}

    def update_oui(self) -> dict[str, Any]:
        try:
            n = OuiDb.update_from_ieee()
        except Exception as e:
            return {"ok": False, "error": f"Update failed: {e}"}
        self.oui = OuiDb()
        self.tracker.oui = self.oui
        if self.case:
            self.case.audit("oui_update", f"{n} entries")
        return {"ok": True, "entries": n}

    def clear_devices(self) -> dict[str, Any]:
        self.tracker.clear()
        if self.case:
            self.case.audit("clear_view", "device list cleared (raw log retained)")
        return {"ok": True}

    def set_position(self, x: float, y: float) -> dict[str, Any]:
        """Examiner position from the survey map (metres east/north of the walk origin).
        Only the demo source uses it, to simulate signal changing as you walk."""
        if self.source is not None and hasattr(self.source, "set_position"):
            self.source.set_position(x, y)
        return {"ok": True}

    def open_folder(self, path: str | None = None) -> dict[str, Any]:
        p = path or (str(self.case.folder) if self.case else str(cases_dir()))
        try:
            if sys.platform.startswith("win"):
                os.startfile(p)  # type: ignore[attr-defined]
            elif sys.platform == "darwin":
                subprocess.Popen(["open", p])
            else:
                subprocess.Popen(["xdg-open", p])
        except Exception as e:
            return {"ok": False, "error": str(e)}
        return {"ok": True}
