# Serial protocol

The stick and the PC exchange newline-terminated text over USB serial.

| Board | Link | Baud |
|---|---|---|
| M5StickC Plus2 | CH9102 USB-UART | 921600 |
| StickS3 | USB CDC | baud setting ignored |

Boot messages from the ESP32 ROM appear at 115200 baud before the firmware starts.

## Stick → PC

The stick sends one JSON object per line.

### `hello`

Sent at boot and in reply to `PING`.

```json
{"t":"hello","fw":"FRET-FW 1.2.0","board":"M5StickC Plus2","chip":"ESP32-PICO-V3-02","self":"24:0A:C4:12:34:56"}
```

`self` is the stick's own MAC. FRET ignores it in results.

### `wifi`

```json
{"t":"wifi","k":"beacon","mac":"80:BE:AF:4D:CA:18","bssid":"80:BE:AF:4D:CA:18","rssi":-58,"ch":6,"ms":123456,"raw":"0009484b..."}
```

| Field | Meaning |
|---|---|
| `k` | `probe`, `beacon`, `probe_resp`, `assoc`, `data_sta`, `data_ap`, `data`, `mgmt` |
| `mac` | Transmitter address. Multicast and zero addresses are dropped |
| `bssid` | Network the frame belongs to |
| `rssi`, `ch` | Signal (dBm) and channel |
| `ms` | Stick uptime in milliseconds |
| `raw` | Hex of the tagged parameters (≤ 240 bytes). Empty for data frames |

### `ble`

```json
{"t":"ble","mac":"4A:3C:9D:5C:34:60","at":1,"rssi":-67,"ms":123460,"raw":"02011a0aff4c0010050118442a9c"}
```

| Field | Meaning |
|---|---|
| `at` | Address type: `0` public, `1` random |
| `raw` | Hex of the advertising payload (with scan response appended when active scanning) |

### `stat`

Sent once per second.

```json
{"t":"stat","ch":6,"hop":true,"dwell":250,"wifi":true,"ble":true,"blea":false,"wfps":96.0,"bleps":31.0,"drop":0,"bat":87,"up":3600,"nw":24,"nb":31}
```

| Field | Meaning |
|---|---|
| `ch`, `hop`, `dwell` | Current channel, whether hopping, dwell time in ms |
| `wifi`, `ble`, `blea` | Wi-Fi on, BLE on, BLE active scan on |
| `wfps`, `bleps` | Wi-Fi frames per second and BLE adverts per second |
| `drop` | Records dropped because the queue was full (cumulative) |
| `bat` | Battery % |
| `up` | Uptime in seconds |
| `nw`, `nb` | Unique Wi-Fi and BLE devices in the last 60 seconds |

## PC → Stick

The PC sends commands as text lines, case-insensitive. After any command the stick replies with a `stat` line, or with `hello` for `PING`.

| Command | Effect |
|---|---|
| `PING` | Reply with `hello` and mark the PC link as up |
| `CH AUTO` | Resume hopping channels 1–13 |
| `CH <1-13>` | Lock to one channel |
| `DWELL <50-2000>` | Hop dwell time in ms |
| `BLE ON` / `BLE OFF` | Enable or disable BLE scanning |
| `BLE ACTIVE` / `BLE PASSIVE` | Active scan (sends scan requests, gets names) or passive |
| `WIFI ON` / `WIFI OFF` | Enable or disable Wi-Fi capture |

## Watching the stream yourself

```bash
pio device monitor -b 921600            # from the firmware folder
```

Or use PuTTY or any serial terminal at 921600 baud. Type `PING` and press Enter.
