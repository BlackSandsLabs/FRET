"""MAC vendor (OUI) lookup against the IEEE registries.

Supports all three IEEE block sizes: MA-L (24-bit), MA-M (28-bit) and
MA-S (36-bit). The bundled database is app/fret/data/oui.tsv.gz; an updated
copy downloaded from the IEEE is stored in the user data folder and takes
precedence.
"""
from __future__ import annotations

import csv
import gzip
import io
import re
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from .paths import data_dir

BUNDLED = Path(__file__).resolve().parent / "data" / "oui.tsv.gz"

IEEE_SOURCES = [
    "https://standards-oui.ieee.org/oui/oui.csv",
    "https://standards-oui.ieee.org/oui28/mam.csv",
    "https://standards-oui.ieee.org/oui36/oui36.csv",
    "https://standards-oui.ieee.org/iab/iab.csv",
]


@dataclass(frozen=True)
class Vendor:
    prefix: str
    short: str
    org: str

    @property
    def block(self) -> str:
        return {6: "MA-L", 7: "MA-M", 9: "MA-S"}.get(len(self.prefix), "?")


class OuiDb:
    def __init__(self, path: Path | None = None):
        self.path = path or self._best_path()
        self.by_len: dict[int, dict[str, Vendor]] = {6: {}, 7: {}, 9: {}}
        self._load(self.path)

    @staticmethod
    def user_path() -> Path:
        return data_dir() / "oui.tsv.gz"

    @classmethod
    def _best_path(cls) -> Path:
        up = cls.user_path()
        return up if up.exists() else BUNDLED

    def _load(self, path: Path) -> None:
        with gzip.open(path, "rt", encoding="utf-8") as f:
            for line in f:
                parts = line.rstrip("\n").split("\t")
                if len(parts) != 3:
                    continue
                p, short, org = parts
                if len(p) in self.by_len:
                    self.by_len[len(p)][p] = Vendor(p, short, org)

    def __len__(self) -> int:
        return sum(len(v) for v in self.by_len.values())

    def lookup(self, mac: str) -> Vendor | None:
        h = re.sub(r"[^0-9A-Fa-f]", "", mac).upper()
        for n in (9, 7, 6):  # most specific block first
            v = self.by_len[n].get(h[:n])
            if v:
                return v
        return None

    def prefixes_for(self, pattern: str) -> list[str]:
        rx = re.compile(pattern, re.I)
        return [v.prefix for v in self.by_len[6].values() if rx.search(v.org)]

    # ------------------------------------------------------------------
    @classmethod
    def update_from_ieee(cls, timeout: float = 60) -> int:
        """Download the IEEE registries and replace the user copy."""
        rows: dict[str, tuple[str, str, str]] = {}
        for url in IEEE_SOURCES:
            req = urllib.request.Request(url, headers={"User-Agent": "FRET/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                text = r.read().decode("utf-8", errors="replace")
            for rec in csv.DictReader(io.StringIO(text)):
                p = (rec.get("Assignment") or "").strip().upper()
                org = (rec.get("Organization Name") or "").strip()
                if p and org:
                    rows[p] = (p, _short(org), org)
        if len(rows) < 10000:
            raise RuntimeError(f"IEEE download looked incomplete ({len(rows)} rows)")
        out = cls.user_path()
        out.parent.mkdir(parents=True, exist_ok=True)
        tmp = out.with_suffix(".tmp")
        with gzip.open(tmp, "wt", encoding="utf-8") as f:
            for p in sorted(rows):
                _, s, o = rows[p]
                f.write(f"{p}\t{s}\t{o.replace(chr(9), ' ')}\n")
        tmp.replace(out)
        return len(rows)


def _short(org: str) -> str:
    words = re.sub(r"[^A-Za-z0-9 ]", " ", org).split()
    return "".join(w.capitalize() if w.islower() else w for w in words)[:12] or org[:12]
