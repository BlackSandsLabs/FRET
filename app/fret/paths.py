"""Where FRET keeps settings, the updated vendor database and case folders."""
from __future__ import annotations

import os
from pathlib import Path


def data_dir() -> Path:
    base = os.environ.get("APPDATA")
    p = Path(base) / "FRET" if base else Path.home() / ".fret"
    p.mkdir(parents=True, exist_ok=True)
    return p


def cases_dir() -> Path:
    docs = Path.home() / "Documents"
    p = (docs if docs.exists() else Path.home()) / "FRET Cases"
    p.mkdir(parents=True, exist_ok=True)
    return p
