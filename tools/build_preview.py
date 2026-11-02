"""Build a single-file, hardware-free preview of the FRET UI (preview.html).

Start the app in demo/browser mode first, then run this:
    python -m fret --demo --browser --http-port 8767
    python tools/build_preview.py 8767
"""
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / "app" / "fret" / "ui"
port = sys.argv[1] if len(sys.argv) > 1 else "8767"
req = urllib.request.Request(f"http://127.0.0.1:{port}/api/get_state", data=b"[]", method="POST")
st = json.loads(urllib.request.urlopen(req).read())
st.update(case=None, toast="", oui_path=r"C:\Users\Examiner\AppData\Roaming\FRET\oui.tsv.gz")
st["source"]["error"] = ""
html = (UI / "index.html").read_text()
html = html.replace('<link rel="stylesheet" href="app.css">', "<style>" + (UI / "app.css").read_text() + "</style>")
html = html.replace('<script src="mock.js"></script>',
                    "<script>window.FRET_FORCE_MOCK=true;window.FRET_PREVIEW_STATE=" + json.dumps(st) + ";</script><script>"
                    + (UI / "mock.js").read_text() + "</script>")
html = html.replace('<script src="app.js"></script>', "<script>" + (UI / "app.js").read_text() + "</script>")
html = html.replace("<title>FRET — Forensic Radio Examination Tool</title>", "<title>FRET — App Preview</title>")
(ROOT / "preview.html").write_text(html)
print(len(st["devices"]), "devices,", len(html), "bytes")
