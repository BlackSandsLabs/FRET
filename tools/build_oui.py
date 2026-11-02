"""Build FRET's compact vendor database (app/fret/data/oui.tsv.gz).

Two supported inputs:
  python tools/build_oui.py --wireshark manuf-data.c
  python tools/build_oui.py --ieee oui.csv mam.csv oui36.csv [iab.csv cid.csv]

The IEEE CSVs are published at standards-oui.ieee.org (oui/oui.csv,
oui28/mam.csv, oui36/oui36.csv, iab/iab.csv). The FRET app can also fetch
them itself from Settings > Update vendor database.

Output format: one line per assignment, tab separated:
    <hex prefix (6, 7 or 9 hex digits)>\t<short name>\t<organisation>
"""
from __future__ import annotations

import argparse
import csv
import gzip
import io
import re
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "app" / "fret" / "data" / "oui.tsv.gz"

WS_RE = re.compile(r'\{\s*\{\s*((?:0x[0-9A-Fa-f]{2}\s*,?\s*)+)\},\s*"((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)"\s*\}')


def from_wireshark(path: Path) -> list[tuple[str, str, str]]:
    rows = []
    for m in WS_RE.finditer(path.read_text(encoding="utf-8", errors="replace")):
        octets = [int(x, 16) for x in m.group(1).replace(" ", "").split(",") if x]
        short, org = m.group(2), m.group(3).replace('\\"', '"')
        if len(octets) == 3:
            prefix = "".join(f"{o:02X}" for o in octets)
        elif len(octets) == 4:  # MA-M: 28 bits
            prefix = "".join(f"{o:02X}" for o in octets)[:7]
        elif len(octets) == 5:  # MA-S: 36 bits
            prefix = "".join(f"{o:02X}" for o in octets)[:9]
        else:
            continue
        rows.append((prefix, short, org))
    return rows


def short_name(org: str) -> str:
    words = re.sub(r"[^A-Za-z0-9 ]", " ", org).split()
    return "".join(w.capitalize() if w.islower() else w for w in words)[:12] or org[:12]


def from_ieee(paths: list[Path]) -> list[tuple[str, str, str]]:
    rows = []
    for p in paths:
        with open(p, newline="", encoding="utf-8", errors="replace") as f:
            for r in csv.DictReader(f):
                prefix = (r.get("Assignment") or "").strip().upper()
                org = (r.get("Organization Name") or "").strip()
                if prefix and org:
                    rows.append((prefix, short_name(org), org))
    return rows


def write(rows: list[tuple[str, str, str]], out: Path = OUT) -> int:
    seen: dict[str, tuple[str, str, str]] = {}
    for r in rows:
        seen[r[0]] = r
    buf = io.StringIO()
    for prefix in sorted(seen):
        p, s, o = seen[prefix]
        buf.write(f"{p}\t{s.replace(chr(9), ' ')}\t{o.replace(chr(9), ' ')}\n")
    out.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(out, "wt", encoding="utf-8", compresslevel=9) as f:
        f.write(buf.getvalue())
    return len(seen)


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--wireshark", type=Path)
    g.add_argument("--ieee", type=Path, nargs="+")
    ap.add_argument("--out", type=Path, default=OUT)
    a = ap.parse_args(argv)
    rows = from_wireshark(a.wireshark) if a.wireshark else from_ieee(a.ieee)
    n = write(rows, a.out)
    print(f"wrote {n} assignments to {a.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
