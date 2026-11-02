"""Case management and evidential logging.

Each case gets its own folder containing a SQLite database with every raw
observation (UTC timestamps), an audit trail of examiner actions, and the
exported reports. Exports are hashed (SHA-256) and the hashes recorded in a
manifest and in the audit trail.
"""
from __future__ import annotations

import csv
import datetime as dt
import hashlib
import html
import json
import platform
import re
import sqlite3
import threading
from pathlib import Path
from typing import Any

from . import __version__
from .paths import cases_dir

SCHEMA = """
CREATE TABLE IF NOT EXISTS case_info (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY, ts_utc TEXT, medium TEXT, mac TEXT, kind TEXT,
    rssi INTEGER, channel INTEGER, bssid TEXT, raw_hex TEXT);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, ts_utc TEXT, action TEXT, detail TEXT);
CREATE INDEX IF NOT EXISTS obs_mac ON observations(mac);
"""


def utcnow() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def iso(ts: float) -> str:
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


class Case:
    def __init__(self, info: dict[str, str], root: Path | None = None):
        self.info = {k: str(v).strip() for k, v in info.items()}
        ref = self.info.get("reference") or "UNREF"
        stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        safe = re.sub(r"[^A-Za-z0-9._-]+", "_", ref)[:60]
        self.folder = (root or cases_dir()) / f"{safe}_{stamp}"
        self.folder.mkdir(parents=True, exist_ok=False)
        self.db_path = self.folder / "case.db"
        self.db = sqlite3.connect(self.db_path, check_same_thread=False)
        self.db.executescript(SCHEMA)
        self.lock = threading.Lock()
        self.pending: list[tuple] = []
        self.obs_count = 0
        self.started = utcnow()
        self.ended = ""
        meta = {**self.info, "started_utc": self.started, "fret_version": __version__,
                "host": platform.node(), "os": platform.platform()}
        self.db.executemany("INSERT OR REPLACE INTO case_info VALUES (?,?)", meta.items())
        self.db.commit()
        self.audit("case_opened", json.dumps(self.info))

    def audit(self, action: str, detail: str = "") -> None:
        with self.lock:
            self.db.execute("INSERT INTO audit (ts_utc, action, detail) VALUES (?,?,?)", (utcnow(), action, detail))
            self.db.commit()

    def log(self, rec: dict[str, Any]) -> None:
        if rec.get("t") not in ("wifi", "ble"):
            return
        row = (utcnow(), rec["t"], str(rec.get("mac", "")).upper(), rec.get("k", "adv"),
               int(rec.get("rssi", 0)), int(rec.get("ch", 0) or 0), rec.get("bssid", ""), rec.get("raw", ""))
        with self.lock:
            self.pending.append(row)
            self.obs_count += 1

    def flush(self) -> None:
        with self.lock:
            if self.pending:
                self.db.executemany(
                    "INSERT INTO observations (ts_utc, medium, mac, kind, rssi, channel, bssid, raw_hex) VALUES (?,?,?,?,?,?,?,?)",
                    self.pending)
                self.db.commit()
                self.pending.clear()

    def close(self) -> None:
        self.flush()
        self.ended = utcnow()
        with self.lock:
            self.db.execute("INSERT OR REPLACE INTO case_info VALUES ('ended_utc', ?)", (self.ended,))
            self.db.commit()
        self.audit("case_closed", f"{self.obs_count} observations")
        with self.lock:
            self.db.close()  # release the file (Windows locks open SQLite files)

    # ------------------------------------------------------------------
    def export(self, devices: list[dict[str, Any]], settings: dict[str, Any]) -> dict[str, Any]:
        self.flush()
        stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        out = self.folder / f"export_{stamp}"
        i = 2
        while out.exists():
            out = self.folder / f"export_{stamp}_{i}"
            i += 1
        out.mkdir()
        devices = sorted(devices, key=lambda d: (d["range"] or {}).get("est", 9e9))

        # devices.csv
        cols = ["medium", "mac", "make", "randomized", "category_label", "confidence", "model", "model_src",
                "est_m", "min_m", "max_m", "rssi_median", "first_seen_utc", "last_seen_utc", "count",
                "channels", "ssid_ap", "probed", "linked", "flagged", "note"]
        with open(out / "devices.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(cols)
            for d in devices:
                r = d["range"] or {}
                w.writerow([d["medium"], d["mac"], d["make"], d["randomized"], d["category_label"], d["confidence"],
                            d["model"], d["model_src"], r.get("est"), r.get("min"), r.get("max"), r.get("rssi"),
                            iso(d["first_seen"]), iso(d["last_seen"]), d["count"],
                            " ".join(map(str, d["channels"])), d["ssid_ap"], "; ".join(d["probed"]),
                            " ".join(d.get("linked", [])), d["flagged"], d["note"]])

        # observations.csv (raw log)
        with self.lock, open(out / "observations.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["ts_utc", "medium", "mac", "kind", "rssi", "channel", "bssid", "raw_hex"])
            for row in self.db.execute("SELECT ts_utc, medium, mac, kind, rssi, channel, bssid, raw_hex FROM observations ORDER BY id"):
                w.writerow(row)

        # devices.json
        info = dict(self.db.execute("SELECT key, value FROM case_info").fetchall())
        (out / "devices.json").write_text(json.dumps({"case": info, "settings": settings, "devices": devices},
                                                     indent=2, default=str), encoding="utf-8")

        # report.html
        (out / "report.html").write_text(self._report(info, devices, settings), encoding="utf-8")

        # manifest
        hashes = {p.name: sha256(p) for p in sorted(out.iterdir())}
        lines = [f"{h}  {n}" for n, h in hashes.items()]
        (out / "SHA256SUMS.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
        self.audit("export", json.dumps({"folder": out.name, "sha256": hashes}))
        return {"folder": str(out), "hashes": hashes}

    def _report(self, info: dict[str, str], devices: list[dict[str, Any]], settings: dict[str, Any]) -> str:
        e = html.escape
        rows = []
        for d in devices:
            r = d["range"] or {}
            rng = f"{r.get('est', '-')} m <span>({r.get('min', '-')}&ndash;{r.get('max', '-')} m)</span>" if r else "-"
            rows.append(
                f"<tr><td>{e(d['category_label'])}<span>{d['confidence']}%</span></td>"
                f"<td class=m>{e(d['mac'])}<span>{e(d['medium'].upper())}{' &middot; randomised' if d['randomized'] else ''}</span></td>"
                f"<td>{e(d['make'])}</td><td>{e(d['model'] or '-')}<span>{e(d['model_src'])}</span></td>"
                f"<td>{rng}</td><td>{e(iso(d['first_seen']))}<span>{e(iso(d['last_seen']))}</span></td>"
                f"<td>{d['count']}</td><td>{e(d['note'])}{' &#9873;' if d['flagged'] else ''}</td></tr>")
        audit = "".join(f"<tr><td class=m>{e(a)}</td><td>{e(b)}</td><td class=m>{e(c[:300])}</td></tr>"
                        for a, b, c in self.db.execute("SELECT ts_utc, action, detail FROM audit ORDER BY id"))
        meta = "".join(f"<div><b>{e(k.replace('_', ' ').title())}</b>{e(v)}</div>" for k, v in info.items())
        return f"""<!DOCTYPE html><html><head><meta charset=utf-8><title>FRET report {e(info.get('reference', ''))}</title>
<style>body{{font:14px -apple-system,'Segoe UI',sans-serif;color:#111;margin:32px}}h1{{letter-spacing:4px;margin:0}}
.meta{{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 24px;margin:20px 0}}.meta b{{display:block;font-size:11px;text-transform:uppercase;color:#666}}
table{{border-collapse:collapse;width:100%;margin:12px 0 28px}}th,td{{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;vertical-align:top}}
th{{font-size:11px;text-transform:uppercase;color:#666}}td span{{display:block;font-size:11px;color:#777}}.m{{font-family:Consolas,monospace}}
.note{{background:#f4f6f8;padding:12px 16px;border-radius:8px;font-size:12.5px;color:#444}}</style></head><body>
<h1>FRET</h1><div>Forensic Radio Examination Tool &mdash; device survey report</div>
<div class=meta>{meta}<div><b>Range model</b>{e(settings.get('environment', 'indoor'))} environment</div><div><b>Devices</b>{len(devices)}</div></div>
<div class=note>{'Bluetooth used active scanning (short scan requests were transmitted to obtain device names); Wi-Fi collection was passive.' if settings.get('ble_active') else 'Collection was passive: the receiver did not transmit or connect to any device.'} Make is derived from the IEEE
registry entry for the MAC address prefix; randomised (locally administered) addresses have no registry entry. Model and device
type are inferences from broadcast data and are shown with their source and a confidence score. Distances are estimates from
received signal strength using a log-distance model and give a range, not a position; no bearing is measured.</div>
<h2>Devices</h2><table><tr><th>Type</th><th>Address</th><th>Make</th><th>Model hint</th><th>Est. distance</th><th>First / last seen (UTC)</th><th>Obs.</th><th>Notes</th></tr>{''.join(rows)}</table>
<h2>Audit trail</h2><table><tr><th>UTC</th><th>Action</th><th>Detail</th></tr>{audit}</table>
<div class=note>Generated by FRET {e(__version__)} at {e(utcnow())}. File hashes are listed in SHA256SUMS.txt.</div></body></html>"""
