"""Launch FRET.

    python -m fret             desktop window, auto-detect the StickS3
    python -m fret --demo      desktop window with simulated devices
    python -m fret --browser   serve the UI to your web browser instead
    python -m fret --port COM5 use a specific serial port
"""
from __future__ import annotations

import argparse
import json
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .engine import Engine

UI_DIR = Path(__file__).resolve().parent / "ui"
API_METHODS = {"get_state", "list_ports", "use_source", "send_command", "start_case", "end_case", "export",
               "annotate", "set_setting", "calibrate", "update_oui", "clear_devices", "open_folder",
               "set_position"}


def make_handler(engine: Engine):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):  # quiet
            pass

        def _send(self, code: int, body: bytes, ctype: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            name = self.path.split("?")[0].lstrip("/") or "index.html"
            f = (UI_DIR / name).resolve()
            if UI_DIR not in f.parents or not f.is_file():
                return self._send(404, b"not found", "text/plain")
            ctype = {".html": "text/html", ".css": "text/css", ".js": "application/javascript",
                     ".svg": "image/svg+xml"}.get(f.suffix, "application/octet-stream")
            self._send(200, f.read_bytes(), ctype + "; charset=utf-8")

        def do_POST(self):
            if not self.path.startswith("/api/"):
                return self._send(404, b"{}", "application/json")
            name = self.path[5:]
            if name not in API_METHODS:
                return self._send(404, b'{"error":"unknown"}', "application/json")
            n = int(self.headers.get("Content-Length") or 0)
            args = json.loads(self.rfile.read(n) or b"[]")
            try:
                res = getattr(engine, name)(*args)
            except Exception as e:  # surface errors to the UI
                res = {"ok": False, "error": str(e)}
            self._send(200, json.dumps(res, default=str).encode(), "application/json")

    return Handler


def serve(engine: Engine, port: int = 8765) -> ThreadingHTTPServer:
    srv = ThreadingHTTPServer(("127.0.0.1", port), make_handler(engine))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def main() -> None:
    ap = argparse.ArgumentParser(prog="fret")
    ap.add_argument("--demo", action="store_true", help="simulate devices (no hardware needed)")
    ap.add_argument("--port", help="serial port of the StickS3, e.g. COM5 (default: auto-detect)")
    ap.add_argument("--browser", action="store_true", help="open the UI in the default browser")
    ap.add_argument("--http-port", type=int, default=8765)
    ap.add_argument("--no-open", action="store_true", help=argparse.SUPPRESS)
    a = ap.parse_args()

    engine = Engine(demo=a.demo, port=a.port)
    # The UI always talks to the engine over a private localhost HTTP API, in the
    # desktop window and in browser mode alike.
    if not a.browser:
        try:
            import webview  # pywebview
        except ImportError:
            print("pywebview not installed - falling back to browser mode")
            a.browser = True
    if a.browser:
        serve(engine, a.http_port)
        url = f"http://127.0.0.1:{a.http_port}/"
        print(f"FRET running at {url}  (Ctrl+C to quit)")
        if not a.no_open:
            webbrowser.open(url)
        try:
            threading.Event().wait()
        except KeyboardInterrupt:
            pass
        return
    srv = serve(engine, 0)  # any free port
    url = f"http://127.0.0.1:{srv.server_address[1]}/"
    webview.create_window("FRET - Forensic Radio Examination Tool", url,
                          width=1440, height=900, min_size=(1100, 700), background_color="#0a0f17")
    webview.start()


if __name__ == "__main__":
    main()
