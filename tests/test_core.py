"""Core engine tests:  python -m unittest discover -s tests   (run from the FRET folder)"""
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
os.environ["HOME"] = tempfile.mkdtemp()
os.environ.pop("APPDATA", None)

from fret import parse, distance  # noqa: E402
from fret.classify import classify  # noqa: E402
from fret.oui import OuiDb  # noqa: E402
from fret.sources import _beacon_ies, _probe_ies, _wps, _ad  # noqa: E402
from fret.tracker import Tracker  # noqa: E402
from fret.case import Case  # noqa: E402

DB = OuiDb()


class TestOui(unittest.TestCase):
    def test_size(self):
        self.assertGreater(len(DB), 50000)

    def test_ma_l(self):
        v = DB.lookup("00:03:93:12:34:56")
        self.assertIn("Apple", v.org)
        self.assertEqual(v.block, "MA-L")

    def test_ma_m_beats_ma_l(self):
        v = DB.lookup("00:55:DA:12:34:56")
        self.assertEqual(v.block, "MA-M")
        self.assertIn("KoolPOS", v.org)

    def test_ma_s(self):
        v = DB.lookup("00-1B-C5-00-01-23")
        self.assertEqual(v.block, "MA-S")

    def test_camera_vendors_present(self):
        for pat in ("hikvision", "dahua", "axis communications"):
            self.assertTrue(DB.prefixes_for(pat), pat)


class TestParse(unittest.TestCase):
    def test_beacon_wps(self):
        info = parse.parse_ies(_beacon_ies("HIK-IPC", 6, _wps("Hikvision", "DS-2CD2143G2-I", "", 4)))
        self.assertEqual(info["ssid"], "HIK-IPC")
        self.assertEqual(info["ds_channel"], 6)
        self.assertEqual(info["wps"]["model_name"], "DS-2CD2143G2-I")
        self.assertEqual(info["wps"]["device_category"], "Camera")

    def test_wildcard_probe_and_fingerprint(self):
        a = parse.parse_ies(_probe_ies(""))
        b = parse.parse_ies(_probe_ies("SomeNet"))
        self.assertEqual(a["ssid"], "")
        self.assertEqual(parse.wifi_fingerprint(a), parse.wifi_fingerprint(b))  # SSID excluded

    def test_truncated_ie_safe(self):
        raw = _beacon_ies("X", 1)
        parse.parse_ies(raw[:7])  # must not raise

    def test_ble_apple(self):
        info = parse.parse_ble_adv(_ad(0x01, b"\x1a") + _ad(0xFF, b"\x4c\x00\x10\x05\x01"))
        self.assertEqual(info["company"], "Apple")
        self.assertTrue(info["apple_type"].startswith("Nearby Info"))

    def test_ble_name_tx_appearance(self):
        import struct
        info = parse.parse_ble_adv(_ad(0x09, b"Forerunner") + _ad(0x0A, b"\xf4") + _ad(0x19, struct.pack("<H", 3 << 6)))
        self.assertEqual(info["name"], "Forerunner")
        self.assertEqual(info["tx_power"], -12)
        self.assertEqual(info["appearance"], "Watch")

    def test_address_kinds(self):
        self.assertTrue(parse.is_locally_administered("DA:00:00:00:00:00"))
        self.assertFalse(parse.is_locally_administered("00:03:93:00:00:00"))
        self.assertEqual(parse.ble_addr_kind("C1:00:00:00:00:00", 1), "random static")
        self.assertEqual(parse.ble_addr_kind("41:00:00:00:00:00", 1), "resolvable private")


class TestDistance(unittest.TestCase):
    def test_reference_point(self):
        r = distance.estimate([-40] * 10, "wifi", "indoor")
        self.assertAlmostEqual(r.estimate_m, 1.0, places=1)

    def test_band_contains_estimate_and_grows_with_distance(self):
        near = distance.estimate([-55, -57, -54, -56, -55], "wifi")
        far = distance.estimate([-80, -83, -79, -82, -81], "wifi")
        for r in (near, far):
            self.assertLessEqual(r.min_m, r.estimate_m)
            self.assertGreaterEqual(r.max_m, r.estimate_m)
        self.assertGreater(far.estimate_m, near.estimate_m)

    def test_ble_tx_power(self):
        r = distance.estimate([-52] * 6, "ble", tx_power=-12)  # ref = -52 -> 1 m
        self.assertAlmostEqual(r.estimate_m, 1.0, places=1)

    def test_calibration_roundtrip(self):
        ref = distance.calibrate_ref([-60] * 5, 1.0)
        self.assertEqual(ref, -60)


class TestClassify(unittest.TestCase):
    def test_hikvision_by_vendor(self):
        v = classify({"vendor_org": "Hangzhou Hikvision Digital Technology Co.,Ltd.", "kinds": {"data_sta": 3}})
        self.assertEqual(v.category, "camera")

    def test_wps_camera_model(self):
        v = classify({"vendor_org": "", "wps": {"manufacturer": "AXIS", "model_name": "P3265-LVE", "device_category": "Camera"}})
        self.assertEqual(v.category, "camera")
        self.assertIn("P3265", v.model)

    def test_random_probe_is_phone(self):
        v = classify({"randomized": True, "kinds": {"probe": 4}})
        self.assertEqual(v.category, "phone")

    def test_windows_cdp(self):
        v = classify({"randomized": True, "ble": {"ms_cdp": True, "company": "Microsoft"}})
        self.assertEqual(v.category, "computer")

    def test_airpods(self):
        v = classify({"randomized": True, "ble": {"company": "Apple", "apple_type": "AirPods / Beats (proximity pairing)"}})
        self.assertEqual(v.category, "wearable")


class TestTrackerAndCase(unittest.TestCase):
    def test_pipeline_and_export(self):
        t = Tracker(DB, {"environment": "indoor", "ref_1m": {}})
        hik = DB.prefixes_for("hikvision")[0]
        mac = ":".join(hik[i:i + 2] for i in (0, 2, 4)) + ":11:22:33"
        raw = _beacon_ies("HIK-IPC-1", 6, _wps("Hikvision", "DS-2CD2143G2-I", "", 4)).hex()
        for r in (-60, -62, -61, -59, -63):
            t.ingest({"t": "wifi", "k": "beacon", "mac": mac, "bssid": mac, "rssi": r, "ch": 6, "raw": raw})
        t.ingest({"t": "ble", "mac": "4A:11:22:33:44:55", "at": 1, "rssi": -70,
                  "raw": (_ad(0xFF, b"\x4c\x00\x10\x05\x01")).hex()})
        snap = {d["mac"]: d for d in t.snapshot()}
        cam = snap[mac]
        self.assertEqual(cam["category"], "camera")
        self.assertIn("Hikvision", cam["make"])
        self.assertIn("DS-2CD2143G2-I", cam["model"])
        self.assertIsNotNone(cam["range"])
        apple = snap["4A:11:22:33:44:55"]
        self.assertTrue(apple["randomized"])
        self.assertTrue(apple["make"].startswith("Apple"))

        with tempfile.TemporaryDirectory() as td:
            c = Case({"reference": "T/1", "examiner": "Tester"}, root=Path(td))
            c.log({"t": "wifi", "k": "beacon", "mac": mac, "rssi": -60, "ch": 6, "raw": raw})
            res = c.export(t.snapshot(), {"environment": "indoor"})
            folder = Path(res["folder"])
            sums = (folder / "SHA256SUMS.txt").read_text()
            for name in ("devices.csv", "devices.json", "observations.csv", "report.html"):
                self.assertIn(name, sums)
            self.assertIn(mac, (folder / "observations.csv").read_text())
            c.close()


if __name__ == "__main__":
    unittest.main()
