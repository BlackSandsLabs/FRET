"""Device-type classification from vendor, WPS, BLE and behaviour evidence.

Each rule adds evidence; the category with the strongest evidence wins. The
reasons are kept so the examiner can see *why* a device was labelled.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

CATEGORIES = {
    "phone": "Phone / tablet",
    "computer": "Computer",
    "camera": "CCTV / camera",
    "wearable": "Wearable / audio",
    "ap": "Access point / router",
    "iot": "IoT / smart device",
    "unknown": "Unidentified",
}

# (regex on IEEE organisation name, category, weight, note)
VENDOR_RULES: list[tuple[str, str, int, str]] = [
    # CCTV / surveillance manufacturers
    (r"hikvision|ezviz", "camera", 80, "surveillance manufacturer"),
    (r"dahua|imou", "camera", 80, "surveillance manufacturer"),
    (r"axis communications", "camera", 80, "surveillance manufacturer"),
    (r"uniview", "camera", 80, "surveillance manufacturer"),
    (r"hanwha (vision|techwin)|samsung techwin", "camera", 80, "surveillance manufacturer"),
    (r"vivotek|mobotix|avigilon|milesight|tiandy|bosch security|pelco|geovision|lorex|swann|reolink|amcrest|annke|foscam", "camera", 75, "surveillance manufacturer"),
    (r"wyze|arlo|ring llc|blink|eufy|anker innovations", "camera", 55, "consumer camera / doorbell brand"),
    # Phones & tablets
    (r"^apple", "phone", 35, "Apple (iPhone, iPad, Mac, Watch)"),
    (r"samsung electronics", "phone", 35, "Samsung (mostly phones/tablets)"),
    (r"xiaomi|oneplus|guangdong oppo|vivo mobile|realme|motorola mobility|huawei device|honor device|nothing technology|fairphone|zte|tcl communication|hmd global|google", "phone", 45, "handset manufacturer"),
    (r"huawei", "phone", 25, "Huawei (phones and network gear)"),
    # Computers / laptop Wi-Fi chipsets
    (r"intel corporate|liteon|lite-on|azurewave|hon hai|cloud network technology|chicony|dell|hewlett|hp inc|lenovo|microsoft|asustek|micro-star|giga-byte|framework computer|acer", "computer", 55, "PC / laptop or Wi-Fi card maker"),
    (r"raspberry pi", "computer", 40, "single-board computer"),
    # Network gear
    (r"tp-link|netgear|ubiquiti|cisco|aruba|ruckus|mikrotik|zyxel|d-link|linksys|eero|juniper|fortinet|technicolor|sagemcom|arcadyan|askey|sercomm|netcomm|kaon|humax|huawei technologies|zte corporation|nokia|calix|actiontec|plume|tenda|mercusys|edimax|draytek|cambium", "ap", 45, "network equipment maker"),
    # IoT modules / smart home
    (r"espressif|samjin|tuya|shelly|allterco|sonoff|itead|silicon labs|nordic semiconductor|amazon technologies|sonos|roku|ecobee|nest labs|signify|philips lighting|lifx|wiz connected", "iot", 50, "IoT module / smart-home maker"),
    # Wearables & audio
    (r"garmin|fitbit|bose|jabra|gn audio|sennheiser|sony|skullcandy|beats", "wearable", 40, "wearable / audio maker"),
]

_COMPILED = [(re.compile(rx, re.I), cat, w, note) for rx, cat, w, note in VENDOR_RULES]

WPS_CATEGORY_MAP = {
    "Camera": "camera", "Computer": "computer", "Telephone": "phone",
    "Network infrastructure": "ap", "Printer/Scanner": "iot", "Display": "iot",
    "Multimedia device": "iot", "Storage": "iot", "Gaming device": "iot",
    "Audio device": "wearable",
}

APPEARANCE_MAP = {
    "Phone": "phone", "Computer": "computer", "Watch": "wearable",
    "Eye-glasses": "wearable", "Heart rate sensor": "wearable", "Audio sink": "wearable",
    "Audio source": "wearable", "Tag": "iot", "Keyring": "iot", "Media player": "iot",
    "Display": "iot", "HID device": "computer",
}

# Default network names of common ISP-supplied and mesh routers (NZ, AU, UK, US).
ROUTER_SSIDS = [(re.compile(rx, re.I), hint) for rx, hint in [
    (r"^smart modem", "Spark Smart Modem"), (r"^spark[-_]", "Spark router"),
    (r"^sky-wifi", "Sky Broadband router"), (r"^trustpower", "Trustpower router"),
    (r"^one ?nz|^vodafone", "One NZ / Vodafone router"), (r"^2degrees", "2degrees router"),
    (r"^orbi", "Netgear Orbi mesh"), (r"^mesh-wifi", "Mesh Wi-Fi node"), (r"^telstra", "Telstra router"),
    (r"^optus", "Optus router"), (r"^bt-|^bthub|^ee-", "BT / EE hub"), (r"^virginmedia|^virgin media", "Virgin Media hub"),
    (r"^xfinity|^xfsetup", "Xfinity gateway"), (r"^netgear", "Netgear router"), (r"^tp-?link", "TP-Link router"),
    (r"^asus", "ASUS router"), (r"^linksys", "Linksys router"), (r"^eero", "eero mesh"), (r"^google|^nest", "Google/Nest Wifi"),
    (r"^direct-.*(hp|epson|brother|canon)", "Printer (Wi-Fi Direct)"), (r"^hp-print|^hp-setup", "HP printer"),
    (r"^\[tv\]|samsung.*tv|^lg_|^bravia", "Smart TV"), (r"^chromecast", "Chromecast"),
]]

CAMERA_MODEL_RX = re.compile(r"\b(DS-2CD|DS-2DE|DS-7|IPC-|DH-|HDW|HFW|SD\d|IPC\d|AXIS|P\d{4}|M\d{4}|Q\d{4}|XNV|XNO|QNV|PNM|RLC-|E1 |CAM|CAMERA|NVR|DVR)", re.I)
CAMERA_NAME_RX = re.compile(r"camera|cam\b|ipc|nvr|dvr|doorbell|hik|dahua|ezviz|imou|reolink|tapo_c|wyze", re.I)


@dataclass
class Verdict:
    category: str = "unknown"
    confidence: int = 0
    reasons: list[str] = field(default_factory=list)
    model: str = ""
    model_source: str = ""


def classify(dev: dict[str, Any]) -> Verdict:
    """dev keys used: medium, vendor_org, randomized, kinds(dict), wps(dict),
    ble(dict), ssid_ap(str), probed(list)."""
    scores: dict[str, int] = {}
    reasons: list[str] = []

    def add(cat: str, w: int, why: str) -> None:
        scores[cat] = scores.get(cat, 0) + w
        reasons.append(f"{why} → {CATEGORIES[cat]} (+{w})")

    org = dev.get("vendor_org") or ""
    if org:
        for rx, cat, w, note in _COMPILED:
            if rx.search(org):
                add(cat, w, f"Vendor {org.split(',')[0]}: {note}")
                break

    kinds = dev.get("kinds") or {}
    if kinds.get("beacon") or kinds.get("probe_resp"):
        add("ap", 60, "Broadcasts its own network (beacons) - acting as an access point")
    elif kinds.get("data_ap"):
        add("ap", 30, "Sends traffic as an access point")
    if kinds.get("probe") and dev.get("randomized"):
        add("phone", 30, "Randomised MAC sending probe requests (typical of modern phones)")
    elif kinds.get("probe"):
        add("computer", 5, "Sends probe requests (client device)")

    wps = dev.get("wps") or {}
    if wps.get("device_category") in WPS_CATEGORY_MAP:
        add(WPS_CATEGORY_MAP[wps["device_category"]], 90, f"WPS declares device type '{wps['device_category']}'")
    wps_model = " ".join(x for x in (wps.get("model_name"), wps.get("model_number")) if x)
    if wps_model and CAMERA_MODEL_RX.search(wps_model):
        add("camera", 60, f"WPS model '{wps_model}' matches a camera/NVR pattern")

    ssid = dev.get("ssid_ap") or ""
    if ssid and CAMERA_NAME_RX.search(ssid):
        add("camera", 50, f"Access-point name '{ssid}' suggests a camera")
    router_hint = ""
    for rx, hint in ROUTER_SSIDS:
        if ssid and rx.search(ssid):
            router_hint = hint
            break
    if dev.get("parent"):
        reasons.append(f"Virtual network of {dev['parent']} (same radio, extra SSID)")
    if router_hint == "Smart TV" or router_hint == "Chromecast":
        add("iot", 80, f"Network name '{ssid}' matches a {router_hint}")
    elif router_hint.startswith("Printer") or router_hint == "HP printer":
        add("iot", 80, f"Network name '{ssid}' matches a printer")

    ble = dev.get("ble") or {}
    at = ble.get("apple_type") or ""
    if at.startswith("Nearby Info") or at.startswith("Handoff") or at.startswith("AirDrop"):
        add("phone", 45, f"Apple Continuity: {at}")
    elif at.startswith("AirPods"):
        add("wearable", 80, f"Apple Continuity: {at}")
    elif at.startswith("Find My"):
        add("iot", 20, "Apple Find My broadcast (AirTag or offline Apple device)")
    if ble.get("ms_cdp"):
        add("computer", 70, "Microsoft CDP beacon (Windows PC)")
    if ble.get("appearance") in APPEARANCE_MAP:
        add(APPEARANCE_MAP[ble["appearance"]], 70, f"BLE appearance '{ble['appearance']}'")
    if ble.get("company") == "Samsung" and not ble.get("appearance"):
        add("phone", 25, "Samsung BLE manufacturer data")
    if "Google Fast Pair" in (ble.get("services") or []):
        add("wearable", 40, "Google Fast Pair service (headphones/accessory)")
    name = ble.get("name") or ""
    if name:
        if re.search(r"buds|airpods|headphone|earbud|wh-|wf-|jbl|beats|watch|band|fitbit|garmin", name, re.I):
            add("wearable", 60, f"BLE name '{name}'")
        elif re.search(r"iphone|ipad|galaxy|pixel|phone|redmi|oneplus", name, re.I):
            add("phone", 60, f"BLE name '{name}'")
        elif re.search(r"macbook|laptop|desktop|-pc\b|thinkpad|surface", name, re.I):
            add("computer", 60, f"BLE name '{name}'")
        elif CAMERA_NAME_RX.search(name):
            add("camera", 50, f"BLE name '{name}'")

    v = Verdict(reasons=reasons)
    if scores:
        cat = max(scores, key=scores.get)
        v.category = cat
        total = sum(scores.values())
        v.confidence = min(99, int(scores[cat] * (scores[cat] / total)))
    # Model hint: best explicit source wins
    if wps_model:
        mfr = wps.get("manufacturer", "")
        v.model = f"{mfr} {wps_model}".strip() if mfr and mfr.lower() not in wps_model.lower() else wps_model
        v.model_source = "WPS"
    elif wps.get("device_name"):
        v.model, v.model_source = wps["device_name"], "WPS device name"
    elif name:
        v.model, v.model_source = name, "BLE name"
    elif at:
        hint = {"Nearby Info": "iPhone / iPad / Mac / Watch", "Handoff": "iPhone / iPad / Mac", "AirDrop": "iPhone / iPad / Mac"}
        short = at.split(" (")[0]
        v.model, v.model_source = hint.get(short, short), f"Apple Continuity ({short})"
    elif router_hint:
        v.model, v.model_source = router_hint, f"SSID '{ssid}'"
    elif ssid and v.category in ("camera", "ap"):
        v.model, v.model_source = ssid, "SSID"
    return v
