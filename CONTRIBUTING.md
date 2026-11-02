# Contributing to FRET

Thanks for helping improve FRET. Bug reports, identification improvements and documentation fixes are all welcome.

## Ways to help

- **Report misidentified devices.** Open an issue with the device's **make**, **reasons** (from the detail panel) and what the device actually is. Redact MAC addresses if they're sensitive. These reports directly improve the classifier.
- **Add vendor or SSID rules.** See `VENDOR_RULES` and `ROUTER_SSIDS` in `app/fret/classify.py`.
- **Improve decoding.** BLE manufacturer formats and WPS attributes are in `app/fret/parse.py`.
- **Test new hardware.** Other ESP32 boards should work with a new PlatformIO env.

## Development setup

```bash
git clone https://github.com/<your-account>/FRET.git
cd FRET/app
python -m venv .venv
.venv\Scripts\activate          # Windows   (source .venv/bin/activate on Linux/macOS)
pip install -r requirements.txt
python -m fret --demo --browser # UI in your browser with simulated devices
```

The engine is plain Python 3.10+ with no compiled dependencies. On Linux and macOS, `--browser` mode works for development, while the desktop window needs pywebview's platform backend.

### Tests

```bash
cd FRET
python -m unittest discover -s tests -v
```

Tests cover OUI lookup across all block sizes, IE/WPS/BLE parsing, distance maths, classification and an end-to-end case export. Please add a test for any parsing or classification change. The demo source (`app/fret/sources.py`) builds byte-accurate frames, which makes good fixtures.

### Firmware

```bash
cd FRET/firmware
pio run -e m5stickc-plus2          # build only
pio run -e m5stickc-plus2 -t upload --upload-port COM5
```

Keep the serial protocol backwards compatible and document any change in [docs/PROTOCOL.md](docs/PROTOCOL.md).

### UI

The UI is dependency-free HTML, CSS and JS in `app/fret/ui/`. All colours and spacing are CSS variables in the `:root` block of `app.css`. To regenerate the README screenshots, run the demo in browser mode and use Playwright (see `tools/build_preview.py` for a single-file preview build).

## Pull requests

1. Fork and create a branch, e.g. `fix/ble-name-parsing`.
2. Keep changes focused, and update docs and `CHANGELOG.md` (*Unreleased* section).
3. Run the tests.
4. Open the PR using the template, describing what changed and how you tested it.

## Code style

- Python: standard library first, type hints, small pure functions for parsing and classification, and no network access outside the explicit OUI updater.
- C++: Arduino style. Keep radio callbacks short (copy and queue only).
- No telemetry and no outbound connections, ever, apart from the user-initiated IEEE update.

## Licence of contributions

FRET is licensed under the [GNU GPL v3.0](LICENSE). By submitting a contribution you agree that it is licensed under the same terms.

## Code of conduct

Be respectful and constructive. Contributions must support lawful use; features designed to defeat legal protections or to target individuals will not be accepted.
