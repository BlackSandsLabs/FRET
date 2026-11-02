# Hardware

## Supported receivers

| | M5StickC Plus2 | M5Stack StickS3 |
|---|---|---|
| Chip | ESP32-PICO-V3-02 | ESP32-S3-PICO-1-N8R8 |
| Wi-Fi | 2.4 GHz 802.11 b/g/n | 2.4 GHz 802.11 b/g/n |
| Bluetooth | BLE 4.2 | BLE 5 |
| USB link | CH9102 USB-serial (921600 baud) | Native USB CDC |
| Display | 1.14" 135×240 | 1.14" 135×240 |
| Battery | 200 mAh | 250 mAh |
| PlatformIO env | `m5stickc-plus2` | `m5stack-sticks3` |
| `flash_stick.bat` choice | **1** | **2** |

Both receivers behave the same in FRET.

### Telling them apart

The model name is printed on the back label. If you flash the wrong build, the uploader stops with *"This chip is ESP32, not ESP32-S3"* (or the reverse) and nothing is changed on the stick.

## On-stick display and buttons

```
┌──────────────────────────────┐
│ FRET                 PC LINK │
│ WI-FI           BLE          │
│ 24              31           │
│ NEAREST (5s)                 │
│ 4D:CA:18 -52                 │
│ CH 6 HOP  BAT 87%            │
└──────────────────────────────┘
```

- **Counts** are unique devices heard in the last 60 seconds.
- **Nearest** is the strongest device in the last 5 seconds (the last three MAC bytes, then RSSI).
- **PC LINK** appears once the FRET app has connected. Until then the screen shows **NO PC**.

| Button | Action |
|---|---|
| **Front (M5)** | Lock or unlock the current Wi-Fi channel (**LOCK** / **HOP**) |
| **Side** | Toggle dim / normal brightness |

The stick captures whether or not a PC is attached. Without a PC it works as a standalone counter.

## Power

- **USB.** Runs indefinitely. Use a PC port or power bank.
- **Battery.** Roughly 1–2 hours with Wi-Fi and BLE capture active. Dim the screen to extend it.

## Antenna and placement

Both sticks have small internal antennas, so range and distance accuracy depend heavily on placement:

- Keep the stick upright and still for the whole survey.
- Keep it away from metal, monitors and the PC itself (at least 30 cm).
- Don't hold it in your hand during capture: your body absorbs 2.4 GHz.

## Why not an RTL-SDR?

FRET was first specified around an RTL-SDR, but an RTL-SDR **cannot** do this job:

| Need | RTL-SDR |
|---|---|
| Receive 2.4 GHz Wi-Fi and Bluetooth | ✗ Tuning range is about 24 MHz – 1.7 GHz |
| Capture a 20 MHz Wi-Fi channel | ✗ About 2.4 MHz of bandwidth |
| Decode 802.11 / BLE frames carrying MAC addresses | ✗ No practical software path at that bandwidth |

An ESP32 has a real Wi-Fi and Bluetooth radio that decodes these frames in hardware, for about the same cost. An RTL-SDR remains a candidate for an optional sub-GHz module (433/868/915 MHz sensors and alarms); see the [Roadmap](../README.md#roadmap).

## Building firmware manually

If you'd rather use VS Code with the PlatformIO extension, or the PlatformIO CLI:

```bash
cd firmware
pio run -e m5stickc-plus2 -t upload --upload-port COM5     # or -e m5stack-sticks3
pio device monitor -b 921600                               # view the JSON stream
```

The firmware uses Arduino core 2.0.x (`espressif32@6.12.0`), M5Unified and NimBLE-Arduino 1.4.x.
