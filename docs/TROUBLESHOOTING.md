# Troubleshooting

- [Setup](#setup)
- [Flashing](#flashing)
- [Stick problems](#stick-problems)
- [Connection](#connection)
- [Results](#results)
- [Collecting diagnostics](#collecting-diagnostics)

## Setup

| Symptom | Fix |
|---|---|
| `'py' is not recognized` / `python not found` | Reinstall Python and tick **Add python.exe to PATH**, then open a new window |
| `setup_windows.bat` fails installing `pywebview` | Update pip with `app\.venv\Scripts\python -m pip install -U pip`, then re-run setup. On a corporate network, configure the proxy for pip |
| FRET window is blank or doesn't open | Install the Microsoft Edge **WebView2 Runtime**. As a workaround, run `app\.venv\Scripts\python app\run_fret.py --browser` to use your web browser |
| `ModuleNotFoundError: No module named 'serial'` (or `'webview'`) | FRET was started without its Python environment, e.g. after replacing the `app` folder or by running `run_fret.py` directly. Run `app\setup_windows.bat` once, and always start FRET with `FRET.bat`, which repairs the environment automatically from 1.2.1 |
| `FRET.bat` does nothing | Run `app\.venv\Scripts\python app\run_fret.py` from Command Prompt to see the error |

## Flashing

| Message in `flash_stick.bat` | Cause and fix |
|---|---|
| `This chip is ESP32, not ESP32-S3` (or the reverse) | Wrong board chosen. Run it again and pick **1** for M5StickC Plus2 or **2** for StickS3. Nothing was written |
| `Could not open port` / `Access is denied` | Another program (FRET, a serial monitor, a 3D-printer slicer…) is using the port. Close it and retry |
| `No serial data received` / `Failed to connect` | Try another cable (some only charge) or another USB port. If it still fails, put the stick into download mode as described in M5Stack's documentation for your model and retry |
| Port not listed | Driver missing. The Plus2 uses a **CH9102** chip; install the WCH CH9102/CH343 driver from M5Stack's website. The StickS3 needs no driver |
| Very slow first build | Normal: about 300 MB of tools download on the first run. Later builds take under a minute |
| Anything else ending in **FAILED** | Copy the text above the FAILED line into an issue |

## Stick problems

| Symptom | Fix |
|---|---|
| **Screen flashes on and off repeatedly** | The firmware is crashing and restarting. Run `firmware\capture_log.bat` (see [diagnostics](#collecting-diagnostics)) and open an issue with `boot_log.txt`. Older builds crashed when Wi-Fi started before Bluetooth; firmware 1.1.1 and later fixes this |
| Screen blank but USB connected | Press the power button on the side of the stick. Check the battery isn't flat, and leave it on USB for 10 minutes |
| Shows **NO PC** | Normal until the FRET app connects. If FRET is running, see [Connection](#connection) |
| Counts stay at 0 | Check the stick isn't in a metal enclosure. Unlock the channel (front button) so it shows **HOP** |

## Connection

| Symptom | Fix |
|---|---|
| Receiver card says *Receiver not found* | Plug the stick in with a data cable and wait 3 seconds; FRET retries automatically. In **Settings → Source**, choose the COM port explicitly |
| Connects, but no devices appear | Make sure the firmware was flashed (the stick's screen shows FRET). Check another program isn't holding the port |
| Frequent reconnects | A loose cable or USB power saving. Use a rear USB port, or disable *USB selective suspend* in Windows power options |
| **DEMO DATA** badge when you expected live data | You launched `FRET_demo.bat`, or Settings → Source is set to Demo |

## Results

| Symptom | Explanation and fix |
|---|---|
| Many **Randomised address** entries | Expected: modern phones, earbuds and watches randomise their addresses. Check the Bluetooth company ("Apple (from BLE data)") and the reasons. Turn on **Active Bluetooth scan** (if permitted) to get names |
| Few Bluetooth names | Names are mostly in scan responses. Enable **Active Bluetooth scan** |
| A device type looks wrong | Open the device and read the **reasons**. Please report misclassifications with the reasons and make (redact MACs if needed) |
| Distances seem too large or small | Calibrate at 1 m, and pick the right **Environment**. Keep the stick still and away from metal and your body |
| A known device never appears | It may be on 5 GHz only, asleep, or wired. Wake it, or lock to its channel |
| A camera shows as *Access point* | It's broadcasting its own setup network. If the vendor or WPS doesn't reveal it as a camera, add a note and flag it |

## Collecting diagnostics

1. Close FRET.
2. Run **`firmware\capture_log.bat`** and press **Enter**, or type the COM port.
3. It resets the stick and records about 25 seconds of output at 115200 and 921600 baud into `firmware\boot_log.txt`.
4. Attach `boot_log.txt` to a [bug report](../../../issues/new?template=bug_report.yml).

If the log shows a `Backtrace:`, also attach the build file `firmware\.pio\build\<env>\firmware.elf` (or keep it for decoding).
