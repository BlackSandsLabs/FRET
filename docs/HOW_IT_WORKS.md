# How it works

- [Capture](#capture)
- [Make: the IEEE registry](#make-the-ieee-registry)
- [Randomised addresses](#randomised-addresses)
- [Model hints](#model-hints)
- [Device type classification](#device-type-classification)
- [Linking addresses](#linking-addresses)
- [Distance estimation](#distance-estimation)
- [Triangulation from a walk](#triangulation-from-a-walk)

---

## Capture

The stick runs two receivers at the same time, sharing one 2.4 GHz radio through the ESP32's coexistence scheduler.

**Wi-Fi.** Promiscuous receive of management and data frames. The stick hops channels 1→13, staying `dwell` ms on each (250 ms by default). For each frame it extracts:

| Field | Source |
|---|---|
| Transmitter MAC | Address 2 |
| Frame kind | `probe`, `beacon`, `probe_resp`, `assoc`, `data_sta` (client → AP), `data_ap` (AP → client) |
| BSSID | Address 3 (management frames) or the AP address (data frames) |
| RSSI, channel | Radio metadata |
| Tagged parameters | Up to 240 bytes, **management frames only**. Data-frame payloads are never read |

**Bluetooth LE.** Scan with a 100 ms interval and a 50 ms window, leaving airtime for Wi-Fi. The scan is passive by default. Each advert gives the address, address type, RSSI and raw advertising payload. With **active scan** on, scan-response data (names, extra services) is included as well.

The stick rate-limits each device to one report every 400 ms. Frames that carry identity data get through more often. Reports go to the PC as JSON lines; see [PROTOCOL.md](PROTOCOL.md).

## Make: the IEEE registry

A globally unique MAC address starts with an identifier assigned by the IEEE to a manufacturer. FRET bundles all three block sizes and uses the most specific match:

| Block | Prefix length | Example |
|---|---|---|
| MA-S | 36 bits | `00:1B:C5:00:0x:xx` |
| MA-M | 28 bits | `00:55:DA:1x:xx:xx` |
| MA-L | 24 bits | `80:BE:AF:xx:xx:xx` → Hangzhou Hikvision |

The make is the **registered organisation**. That's usually the brand, but sometimes it's the module maker inside the product:

- *Espressif* is an IoT module maker.
- *AzureWave* and *Liteon* are laptop Wi-Fi card makers.
- *Askey* and *Arcadyan* build ISP routers.

## Randomised addresses

If bit 1 of the first byte (the *locally administered* bit) is set, the address was not assigned by the IEEE. In practice it's randomised. Since iOS 14, Android 10 and Windows 10 (optional), phones and many laptops use these for Wi-Fi. Most Bluetooth devices use random addresses too:

| BLE address type | Top bits | Meaning |
|---|---|---|
| Public | — | IEEE-assigned, so it has a make |
| Random static | `11` | Fixed until reset or power cycle |
| Resolvable private | `01` | Changes about every 15 min; only paired devices can resolve it |
| Non-resolvable | `00` | Changes often |

For these devices FRET says **Randomised address** and then tries other routes to a brand:

- the **Bluetooth company ID** in manufacturer data, giving e.g. *Apple (from BLE data)*
- for router guest and mesh networks, the **parent router** (see [Linking](#linking-addresses))

## Model hints

FRET shows a model only when a device broadcasts one. In order of preference:

| Source | Typical devices | Example |
|---|---|---|
| **WPS** (manufacturer, model name, model number) | Cameras, printers, routers, some TVs | *Hikvision DS-2CD2143G2-I* |
| **WPS device name** | Printers, extenders | *HP OfficeJet 8020* |
| **Bluetooth name** | Earbuds, watches, TVs, speakers, laptops | *Galaxy Buds2 Pro* |
| **Apple Continuity** | iPhones, iPads, Macs, AirPods, AirTags | *iPhone / iPad / Mac / Watch*, *AirPods / Beats* |
| **Network name (SSID) patterns** | ISP routers, mesh, TVs, printers | *Spark Smart Modem*, *Netgear Orbi mesh* |

Most Bluetooth names are only sent in scan responses, which is why **Active Bluetooth scan** greatly increases named devices.

## Device type classification

Every device gets a score per category. Each piece of evidence adds weight, and the highest total wins. Confidence is that score scaled by how dominant it is over the other categories, from 0 to 99%. The reasons are listed in the device panel.

| Evidence | Category | Weight |
|---|---|---|
| WPS device category (Camera, Computer, Telephone…) | as declared | 90 |
| Surveillance manufacturer OUI | CCTV | 75–80 |
| AirPods proximity pairing | Wearable | 80 |
| TV / Chromecast / printer network name | IoT | 80 |
| Microsoft CDP beacon | Computer | 70 |
| BLE appearance (Phone, Computer, Watch…) | as declared | 70 |
| Broadcasts beacons | Access point | 60 |
| WPS model matching a camera or NVR pattern | CCTV | 60 |
| Bluetooth name keywords | as matched | 50–60 |
| Network or PC maker OUI | AP / Computer | 45–55 |
| Apple Nearby Info / Handoff | Phone | 45 |
| Handset maker OUI | Phone | 35–45 |
| Randomised MAC sending probe requests | Phone | 30 |

Devices with no evidence are **Unidentified**. That's usually a registered maker FRET has no type rule for, or a randomised device that never broadcast anything descriptive.

## Linking addresses

**Router virtual networks.** Routers and mesh systems broadcast extra networks (guest, IoT, backhaul) from locally administered BSSIDs derived from their real address. For example, `B0:A7:B9:2A:65:97` (TP-Link) may also broadcast `D2:A7:B9:2A:65:97`. FRET treats a randomised access point as a *virtual network* of a registered device when:

- the middle four bytes match, **and**
- the last byte is within 15.

It then inherits that device's make.

**Probe fingerprints.** A probe request's set and order of information elements, supported rates, HT/VHT/HE capabilities and vendor elements are hashed, excluding the SSID. A phone keeps the same fingerprint when it rotates its random MAC, so matching fingerprints are shown as *possibly the same device*. Identical phone models share fingerprints, so this is a **lead, not proof**.

## Distance estimation

FRET uses the log-distance path-loss model:

```
RSSI(d) = RSSI(1 m) − 10 · n · log10(d)        ⇒        d = 10 ^ ((RSSI(1 m) − RSSI) / (10 · n))
```

- **RSSI.** The median of the readings from the last 30 seconds, which is robust to spikes.
- **RSSI(1 m).** The calibrated reference. Defaults are −40 dBm for Wi-Fi and −59 dBm for BLE. If a BLE device advertises its TX power, FRET uses `TX power − 40 dB` instead (free-space loss at 1 m, 2.4 GHz).
- **n.** The path-loss exponent, which depends on the environment:

| Environment | n (low – mid – high) |
|---|---|
| Open space | 1.8 – 2.2 – 2.7 |
| Indoor | 2.2 – 2.8 – 3.5 |
| Dense building | 2.8 – 3.5 – 4.5 |

FRET calculates three distances:

- The **estimate** uses the median RSSI with the middle `n`.
- The **range** spans from (stronger RSSI, high `n`) to (weaker RSSI, low `n`). The RSSI margin is the measured spread, between 3 and 10 dB, plus 3 dB when there are fewer than 5 readings.
- Distances are clamped to 0.3–500 m.

**Calibration** inverts the model at a known distance with `n = 2`, giving `RSSI(1 m) = median + 20 · log10(d)`.

One receiver at one spot gives range only. Direction comes from moving the receiver (see below), from several receivers (on the roadmap) or from a directional antenna.

---

## Triangulation from a walk

In **Triangulate** mode the receiver becomes the moving part. FRET takes the examiner's position (Windows location, a tap on the map, or the demo walk), expressed in metres east and north of where the walk started, and solves for where each device must be to explain the readings.

**Collecting.** Once a second, each device heard in the last 1.5 s adds one sample `(x, y, RSSI)`. Samples are grouped into 1.5 m spots, and each spot keeps its median RSSI. A spot's weight is `1 / (16 + 16 / k)` for `k` readings, so it never counts as more certain than about ±4 dB, the typical shadowing from walls and bodies. GPS fixes worse than ±30 m are not sampled.

**Solving.** For each point `p` on a 64 × 64 grid covering the walk plus the likely range:

```
r'ᵢ = RSSIᵢ + 10 · n · log10(|p − spotᵢ|)          (what each spot implies RSSI(1 m) is)
A*  = weighted mean of r'ᵢ, plus the calibrated RSSI(1 m) as a pseudo-reading with σ = 10 dB
cost(p) = Σ wᵢ (r'ᵢ − A*)² + (A* − A₀)² / 100
```

The reference level is fitted, not assumed, so a poor 1 m calibration doesn't pull the position, only the prior. The point with the lowest cost is the **estimate**. `n` is the environment's middle exponent.

**Uncertainty.** The cost becomes a likelihood `exp(−(cost − min) / 2)` over the grid. Its second moments about the estimate give a covariance, whose eigenvectors set the ellipse, and `2.45 σ` along each axis is the **95% ellipse**. The ellipse is measured about the best point, not the mean, so a mirror ambiguity (a straight-line walk can't tell left from right) widens it instead of putting the point between the two answers. The rating uses the long axis: *good* ≤ 6 m, *fair* ≤ 15 m, otherwise *rough* (also if the best point is on the grid's edge).

**Minimum data.** At least 8 readings from 4 spots, spread over at least 3 m.

**Map and frame.** Positions use a flat local frame (metres from the walk origin), which is accurate over survey distances. Satellite imagery is Esri World Imagery in Web Mercator tiles, scaled to the same metres per pixel. The demo engine places each simulated device on a fixed bearing, and the UI's `set_position` call makes its signals follow the walker.
