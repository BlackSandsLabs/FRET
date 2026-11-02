# Changelog

All notable changes to FRET are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [1.2.1] - 2026-11-03

### Added
- **Receiver model** choice in Settings → Receiver: *Auto*, *M5StickC Plus2* or *M5Stack StickS3*. Auto-detect prefers the chosen model's USB chip (CH9102 for the Plus2, Espressif USB for the StickS3).
- The Source list names detected sticks (e.g. *COM7 — M5StickC Plus2 ★*).

### Fixed
- `FRET.bat`, `FRET_demo.bat` and `capture_log.bat` now set up or repair FRET's Python environment automatically, fixing `ModuleNotFoundError: No module named 'serial'` after replacing the `app` folder. If pyserial is still missing, the receiver card says so instead of failing silently.
- The app's wording assumed a StickS3 everywhere ("Auto-detect StickS3", setup hints, receiver card). It now covers both receivers, and the receiver card shows the model the stick reports.
- The Source dropdown now shows the selected COM port instead of jumping back to Auto.

## [1.2.0] - 2026-11-02

### Added
- Released under the **GNU GPL v3.0**.
- **Active Bluetooth scan** option (Settings → Receiver). It requests scan responses so devices report their names and models. It is off by default, recorded in the audit trail and stated in the report.
- **Router virtual-network linking.** Randomised BSSIDs broadcast by routers (guest, mesh, IoT networks) are linked to the parent router and inherit its make.
- **ISP and mesh router recognition** from default network names: Spark, Sky, Trustpower, One NZ, 2degrees, Telstra, Optus, BT/EE, Virgin Media, Xfinity, Orbi, eero, Google/Nest and more. Smart TVs, Chromecasts and printers are recognised the same way.
- More network-equipment vendors (NetComm, Kaon, Humax, ZTE, Nokia and others) and SAMJIN (SmartThings) as IoT.
- Firmware command `BLE ACTIVE` / `BLE PASSIVE`, and the `blea` field in `stat`.

### Fixed
- Ending a case now closes `case.db`. Previously Windows kept the file locked until FRET exited.

### Changed
- Broadcasting beacons is now strong evidence for *Access point*, so routers made by PC brands (e.g. ASUS) are no longer typed as computers.
- WPS "category 0" (unspecified) is ignored instead of being shown.

## [1.1.1] - 2026-11-01

### Fixed
- The M5StickC Plus2 boot-looped (`abort()` in `coex_core_enable`). Bluetooth now starts before Wi-Fi, and Wi-Fi modem sleep stays at its default, as the ESP32 coexistence layer requires.

### Added
- `firmware\capture_log.bat` records boot output for troubleshooting.
- `flash_stick.bat` asks which stick is connected.

## [1.1.0] - 2026-11-01

### Added
- **M5StickC Plus2** support (`m5stickc-plus2` PlatformIO env, 921600 baud UART).
- The PC auto-detects CH9102/CH340, CP210x and FTDI USB-serial bridges as well as Espressif USB.
- `flash_stick.bat` builds and flashes without an IDE, using PlatformIO Core in the app's Python environment.
- `hello` now reports the board and chip model.

## [1.0.0] - 2026-11-01

### Added
- First release:
  - StickS3 capture firmware: Wi-Fi promiscuous + channel hopping, passive BLE, on-device display.
  - Windows app with Survey, Devices, Case and Settings views.
  - Bundled IEEE MA-L/M/S vendor database (58k entries) with an in-app updater.
  - WPS, Apple Continuity, Microsoft CDP, Fast Pair and BLE appearance decoding.
  - Evidence-scored classification with reasons.
  - Log-distance range bands with calibration.
  - Probe-fingerprint linking of randomised addresses.
  - SQLite case log, audit trail, CSV/JSON/HTML exports and SHA-256 manifests.
  - Demo mode.
