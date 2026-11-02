// FRET — Forensic Radio Examination Tool
// Copyright (C) 2026 Black Sands Labs. Licensed under the GNU GPL v3.0 or later (see LICENSE).
// Passive capture firmware for the M5Stack StickS3 (ESP32-S3).
//
// * Wi-Fi: promiscuous (monitor-style) receive on 2.4 GHz, hopping channels 1-13.
//   Reports the transmitter MAC, RSSI, channel, frame kind and raw tagged
//   parameters (SSID, WPS manufacturer/model, vendor IEs) for management frames.
// * BLE: passive scan (no scan requests are transmitted). Reports address,
//   address type, RSSI and the raw advertising payload.
// * Output: one JSON object per line over the USB-C serial port.
//
// The device never transmits Wi-Fi frames and never connects to anything.
//
// Host -> device commands (newline terminated):
//   PING            reply with a hello line
//   CH AUTO         resume channel hopping
//   CH <1-13>       lock to one channel
//   DWELL <ms>      hop dwell time (50-2000 ms, default 250)
//   BLE ON|OFF      enable/disable BLE scanning
//   BLE ACTIVE|PASSIVE  active scan requests scan responses (device names); default passive
//   WIFI ON|OFF     enable/disable Wi-Fi capture

#include <Arduino.h>
#include <M5Unified.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <NimBLEDevice.h>

static const char* FW_VERSION = "FRET-FW 1.2.0";
#ifndef FRET_BOARD
#define FRET_BOARD "ESP32"
#endif
// USB-CDC boards ignore the baud rate; UART bridges (CH9102 on the StickC Plus2) need it.
static const uint32_t FRET_BAUD = 921600;

// ---------------------------------------------------------------------------
// Capture records passed from radio callbacks to the main loop
// ---------------------------------------------------------------------------
enum Kind : uint8_t {
  K_PROBE = 0, K_BEACON, K_PROBE_RESP, K_ASSOC, K_DATA_TO_AP, K_DATA_FROM_AP,
  K_DATA_OTHER, K_MGMT_OTHER, K_BLE
};
static const char* KIND_NAMES[] = {
  "probe", "beacon", "probe_resp", "assoc", "data_sta", "data_ap",
  "data", "mgmt", "ble"
};

static const size_t MAX_RAW = 240;

struct Record {
  uint8_t kind;
  uint8_t mac[6];
  uint8_t bssid[6];
  int8_t rssi;
  uint8_t channel;
  uint8_t addrType;  // BLE: 0 public, 1 random
  uint16_t rawLen;
  uint8_t raw[MAX_RAW];
};

static QueueHandle_t gQueue;
static volatile uint32_t gDropped = 0;
static volatile uint32_t gWifiFrames = 0;
static volatile uint32_t gBleAdverts = 0;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
static volatile uint8_t gChannel = 1;
static bool gHopping = true;
static uint16_t gDwellMs = 250;
static bool gBleOn = true;
static bool gBleActive = false;  // active scan sends scan requests to get names (scan responses)
static bool gWifiOn = true;
static uint32_t gLastHop = 0;
static uint32_t gLastStat = 0;
static uint32_t gLastDraw = 0;
static uint8_t gBrightness = 1;  // 0 dim, 1 normal
static bool gHostSeen = false;

// Per-device rate limiting + on-screen counts (small open-addressing table)
struct Seen {
  uint8_t mac[6];
  uint8_t ble;
  int8_t rssi;
  uint32_t lastSent;
  uint32_t lastSeen;
};
static const int SEEN_SLOTS = 512;
static Seen gSeen[SEEN_SLOTS];
static const uint32_t SEND_INTERVAL_MS = 400;
static const uint32_t COUNT_WINDOW_MS = 60000;

static inline bool isMulticast(const uint8_t* m) { return m[0] & 0x01; }
static inline bool isZero(const uint8_t* m) {
  for (int i = 0; i < 6; i++) if (m[i]) return false;
  return true;
}

static Seen* lookupSeen(const uint8_t* mac, bool ble) {
  uint32_t h = 2166136261u;
  for (int i = 0; i < 6; i++) h = (h ^ mac[i]) * 16777619u;
  h ^= ble;
  uint32_t now = millis();
  int oldest = -1;
  uint32_t oldestAge = 0;
  for (int probe = 0; probe < 16; probe++) {
    int idx = (h + probe) % SEEN_SLOTS;
    Seen& s = gSeen[idx];
    if (s.lastSeen == 0 || (memcmp(s.mac, mac, 6) == 0 && s.ble == ble)) {
      if (s.lastSeen == 0) { memcpy(s.mac, mac, 6); s.ble = ble; s.lastSent = 0; }
      return &s;
    }
    uint32_t age = now - s.lastSeen;
    if (age > oldestAge) { oldestAge = age; oldest = idx; }
  }
  Seen& s = gSeen[oldest];  // evict the stalest entry in the probe window
  memcpy(s.mac, mac, 6); s.ble = ble; s.lastSent = 0; s.lastSeen = 0;
  return &s;
}

// ---------------------------------------------------------------------------
// Wi-Fi promiscuous callback (runs in the Wi-Fi task: keep it short)
// ---------------------------------------------------------------------------
static void wifiCb(void* buf, wifi_promiscuous_pkt_type_t type) {
  if (type != WIFI_PKT_MGMT && type != WIFI_PKT_DATA) return;
  const wifi_promiscuous_pkt_t* pkt = (const wifi_promiscuous_pkt_t*)buf;
  const uint8_t* p = pkt->payload;
  int len = pkt->rx_ctrl.sig_len;
  if (len > 4) len -= 4;  // strip FCS
  if (len < 24) return;
  gWifiFrames++;

  uint8_t fc0 = p[0], fc1 = p[1];
  uint8_t ftype = (fc0 >> 2) & 0x3;
  uint8_t sub = (fc0 >> 4) & 0xF;
  const uint8_t* a1 = p + 4;
  const uint8_t* a2 = p + 10;
  const uint8_t* a3 = p + 16;
  if (isMulticast(a2) || isZero(a2)) return;

  Record r;
  r.rssi = pkt->rx_ctrl.rssi;
  r.channel = pkt->rx_ctrl.channel;
  r.addrType = 0;
  r.rawLen = 0;
  memcpy(r.mac, a2, 6);
  memset(r.bssid, 0, 6);

  int ieOffset = -1;
  if (ftype == 0) {  // management
    memcpy(r.bssid, a3, 6);
    switch (sub) {
      case 4: r.kind = K_PROBE; ieOffset = 24; break;
      case 8: r.kind = K_BEACON; ieOffset = 36; break;
      case 5: r.kind = K_PROBE_RESP; ieOffset = 36; break;
      case 0: r.kind = K_ASSOC; ieOffset = 28; break;
      case 2: r.kind = K_ASSOC; ieOffset = 34; break;
      default: r.kind = K_MGMT_OTHER; break;
    }
  } else if (ftype == 2) {  // data
    bool toDS = fc1 & 0x01, fromDS = fc1 & 0x02;
    if (toDS && !fromDS) { r.kind = K_DATA_TO_AP; memcpy(r.bssid, a1, 6); }
    else if (fromDS && !toDS) { r.kind = K_DATA_FROM_AP; memcpy(r.bssid, a2, 6); }
    else { r.kind = K_DATA_OTHER; }
  } else {
    return;
  }

  if (ieOffset > 0 && len > ieOffset) {
    int n = len - ieOffset;
    if (n > (int)MAX_RAW) n = MAX_RAW;
    memcpy(r.raw, p + ieOffset, n);
    r.rawLen = n;
  }
  if (xQueueSend(gQueue, &r, 0) != pdTRUE) gDropped++;
}

// ---------------------------------------------------------------------------
// BLE passive scan callback
// ---------------------------------------------------------------------------
class ScanCb : public NimBLEAdvertisedDeviceCallbacks {
  void onResult(NimBLEAdvertisedDevice* d) override {
    gBleAdverts++;
    Record r;
    r.kind = K_BLE;
    r.rssi = d->getRSSI();
    r.channel = 0;
    r.addrType = d->getAddressType();
    memset(r.bssid, 0, 6);
    // NimBLE stores addresses little-endian; convert to display order.
    const uint8_t* a = d->getAddress().getNative();
    for (int i = 0; i < 6; i++) r.mac[i] = a[5 - i];
    size_t n = d->getPayloadLength();
    if (n > MAX_RAW) n = MAX_RAW;
    memcpy(r.raw, d->getPayload(), n);
    r.rawLen = n;
    if (xQueueSend(gQueue, &r, 0) != pdTRUE) gDropped++;
  }
};
static ScanCb gScanCb;

static void bleStart() {
  NimBLEScan* s = NimBLEDevice::getScan();
  s->setAdvertisedDeviceCallbacks(&gScanCb, true);  // want duplicates for RSSI tracking
  s->setActiveScan(gBleActive);                     // default passive: no scan requests transmitted
  s->setInterval(160);                              // 100 ms
  s->setWindow(80);                                 // 50 ms -> leaves airtime for Wi-Fi
  s->setMaxResults(0);                              // don't store results, callbacks only
  s->start(0, nullptr, false);
}
static void bleStop() { NimBLEDevice::getScan()->stop(); }

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------
static char gLine[MAX_RAW * 2 + 256];

static void macStr(const uint8_t* m, char* out) {
  sprintf(out, "%02X:%02X:%02X:%02X:%02X:%02X", m[0], m[1], m[2], m[3], m[4], m[5]);
}

static void emitRecord(const Record& r) {
  char mac[18], bssid[18];
  macStr(r.mac, mac);
  macStr(r.bssid, bssid);
  int n;
  if (r.kind == K_BLE) {
    n = snprintf(gLine, sizeof(gLine),
                 "{\"t\":\"ble\",\"mac\":\"%s\",\"at\":%u,\"rssi\":%d,\"ms\":%lu,\"raw\":\"",
                 mac, r.addrType, r.rssi, (unsigned long)millis());
  } else {
    n = snprintf(gLine, sizeof(gLine),
                 "{\"t\":\"wifi\",\"k\":\"%s\",\"mac\":\"%s\",\"bssid\":\"%s\",\"rssi\":%d,\"ch\":%u,\"ms\":%lu,\"raw\":\"",
                 KIND_NAMES[r.kind], mac, bssid, r.rssi, r.channel, (unsigned long)millis());
  }
  static const char* HEXD = "0123456789abcdef";
  for (uint16_t i = 0; i < r.rawLen && n < (int)sizeof(gLine) - 4; i++) {
    gLine[n++] = HEXD[r.raw[i] >> 4];
    gLine[n++] = HEXD[r.raw[i] & 0xF];
  }
  gLine[n++] = '"';
  gLine[n++] = '}';
  gLine[n++] = '\n';
  Serial.write((const uint8_t*)gLine, n);
}

static void emitHello() {
  uint8_t m[6];
  esp_read_mac(m, ESP_MAC_WIFI_STA);
  char mac[18];
  macStr(m, mac);
  Serial.printf("{\"t\":\"hello\",\"fw\":\"%s\",\"board\":\"%s\",\"chip\":\"%s\",\"self\":\"%s\"}\n",
                FW_VERSION, FRET_BOARD, ESP.getChipModel(), mac);
}

static int countRecent(bool ble) {
  uint32_t now = millis();
  int c = 0;
  for (int i = 0; i < SEEN_SLOTS; i++)
    if (gSeen[i].lastSeen && gSeen[i].ble == ble && now - gSeen[i].lastSeen < COUNT_WINDOW_MS) c++;
  return c;
}

static void emitStat() {
  static uint32_t lastFrames = 0, lastAdv = 0, lastT = 0;
  uint32_t now = millis();
  float dt = (now - lastT) / 1000.0f;
  if (dt <= 0) dt = 1;
  uint32_t wf = gWifiFrames, ba = gBleAdverts;
  Serial.printf("{\"t\":\"stat\",\"ch\":%u,\"hop\":%s,\"dwell\":%u,\"wifi\":%s,\"ble\":%s,"
                "\"blea\":%s,\"wfps\":%.1f,\"bleps\":%.1f,\"drop\":%lu,\"bat\":%d,\"up\":%lu,\"nw\":%d,\"nb\":%d}\n",
                gChannel, gHopping ? "true" : "false", gDwellMs, gWifiOn ? "true" : "false",
                gBleOn ? "true" : "false", gBleActive ? "true" : "false", (wf - lastFrames) / dt, (ba - lastAdv) / dt,
                (unsigned long)gDropped, (int)M5.Power.getBatteryLevel(), (unsigned long)(now / 1000),
                countRecent(false), countRecent(true));
  lastFrames = wf; lastAdv = ba; lastT = now;
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------
static const uint16_t C_BG = 0x0862;      // #0a0f17-ish
static const uint16_t C_ACCENT = 0x363B;  // #33c7d9-ish
static const uint16_t C_MUTED = 0x8C71;
static const uint16_t C_OK = 0x4EC8;
static const uint16_t C_WARN = 0xFE69;

static void drawScreen() {
  auto& d = M5.Display;
  d.startWrite();
  d.fillScreen(C_BG);
  d.setTextDatum(top_left);
  d.setTextColor(C_ACCENT, C_BG);
  d.setFont(&fonts::FreeSansBold12pt7b);
  d.drawString("FRET", 8, 4);
  d.setFont(&fonts::Font2);
  d.setTextColor(gHostSeen ? C_OK : C_WARN, C_BG);
  d.drawRightString(gHostSeen ? "PC LINK" : "NO PC", d.width() - 8, 8);

  int nw = countRecent(false), nb = countRecent(true);
  d.setTextColor(C_MUTED, C_BG);
  d.drawString("WI-FI", 8, 30);
  d.drawString("BLE", d.width() / 2 + 4, 30);
  d.setTextColor(TFT_WHITE, C_BG);
  d.setFont(&fonts::FreeSansBold18pt7b);
  d.drawNumber(nw, 8, 46);
  d.drawNumber(nb, d.width() / 2 + 4, 46);

  // strongest recent device
  uint32_t now = millis();
  int best = -1;
  for (int i = 0; i < SEEN_SLOTS; i++)
    if (gSeen[i].lastSeen && now - gSeen[i].lastSeen < 5000 && (best < 0 || gSeen[i].rssi > gSeen[best].rssi)) best = i;
  d.setFont(&fonts::Font2);
  d.setTextColor(C_MUTED, C_BG);
  d.drawString("NEAREST (5s)", 8, 80);
  d.setTextColor(TFT_WHITE, C_BG);
  if (best >= 0) {
    char mac[18];
    macStr(gSeen[best].mac, mac);
    char buf[40];
    snprintf(buf, sizeof(buf), "%s %d", mac + 6, gSeen[best].rssi);
    d.drawString(buf, 8, 96);
  } else {
    d.drawString("-", 8, 96);
  }

  char ch[32];
  snprintf(ch, sizeof(ch), "CH %u %s  BAT %d%%", gChannel, gHopping ? "HOP" : "LOCK", (int)M5.Power.getBatteryLevel());
  d.setTextColor(C_MUTED, C_BG);
  d.drawString(ch, 8, d.height() - 18);
  d.endWrite();
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
static void setChannel(uint8_t ch) {
  gChannel = ch;
  esp_wifi_set_channel(ch, WIFI_SECOND_CHAN_NONE);
}

static void handleCommand(String cmd) {
  cmd.trim();
  cmd.toUpperCase();
  gHostSeen = true;
  if (cmd == "PING") { emitHello(); return; }
  if (cmd.startsWith("CH ")) {
    String a = cmd.substring(3);
    if (a == "AUTO") gHopping = true;
    else { int c = a.toInt(); if (c >= 1 && c <= 13) { gHopping = false; setChannel(c); } }
  } else if (cmd.startsWith("DWELL ")) {
    int v = cmd.substring(6).toInt();
    if (v >= 50 && v <= 2000) gDwellMs = v;
  } else if (cmd == "BLE ON") { if (!gBleOn) { gBleOn = true; bleStart(); } }
  else if (cmd == "BLE OFF") { if (gBleOn) { gBleOn = false; bleStop(); } }
  else if (cmd == "BLE ACTIVE" || cmd == "BLE PASSIVE") {
    bool want = cmd == "BLE ACTIVE";
    if (want != gBleActive) { gBleActive = want; if (gBleOn) { bleStop(); delay(20); bleStart(); } }
  }
  else if (cmd == "WIFI ON") { gWifiOn = true; esp_wifi_set_promiscuous(true); }
  else if (cmd == "WIFI OFF") { gWifiOn = false; esp_wifi_set_promiscuous(false); }
  emitStat();
}

// ---------------------------------------------------------------------------
void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setRotation(1);
  M5.Display.setBrightness(120);

#if ARDUINO_USB_CDC_ON_BOOT
  Serial.begin(FRET_BAUD);
  Serial.setTxTimeoutMs(0);  // never block capture when no PC is reading
#else
  Serial.setTxBufferSize(8192);
  Serial.begin(FRET_BAUD);
#endif

  gQueue = xQueueCreate(64, sizeof(Record));
  memset(gSeen, 0, sizeof(gSeen));

  // Bluetooth first: on the ESP32 the Wi-Fi/BT coexistence layer aborts if the BT
  // controller starts after Wi-Fi with modem sleep disabled.
  NimBLEDevice::init("");

  // Wi-Fi: station mode, never associates, promiscuous receive only.
  // Modem sleep must stay at its default while BLE is running (coexistence requirement).
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  wifi_promiscuous_filter_t f = {.filter_mask = WIFI_PROMIS_FILTER_MASK_MGMT | WIFI_PROMIS_FILTER_MASK_DATA};
  esp_wifi_set_promiscuous_filter(&f);
  esp_wifi_set_promiscuous_rx_cb(&wifiCb);
  esp_wifi_set_promiscuous(true);
  setChannel(1);

  bleStart();

  emitHello();
  drawScreen();
}

void loop() {
  M5.update();
  uint32_t now = millis();

  if (M5.BtnA.wasPressed()) {  // front button: lock / unlock current channel
    gHopping = !gHopping;
    emitStat();
  }
  if (M5.BtnB.wasPressed()) {  // side button: dim / normal screen
    gBrightness ^= 1;
    M5.Display.setBrightness(gBrightness ? 120 : 20);
  }

  if (gWifiOn && gHopping && now - gLastHop >= gDwellMs) {
    gLastHop = now;
    setChannel(gChannel % 13 + 1);
  }

  static String cmd;
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') { if (cmd.length()) handleCommand(cmd); cmd = ""; }
    else if (cmd.length() < 64) cmd += c;
  }

  Record r;
  int budget = 48;
  while (budget-- > 0 && xQueueReceive(gQueue, &r, 0) == pdTRUE) {
    bool ble = r.kind == K_BLE;
    Seen* s = lookupSeen(r.mac, ble);
    s->lastSeen = now ? now : 1;
    s->rssi = r.rssi;
    // Management frames carrying IEs are always useful; otherwise rate-limit per device.
    bool hasInfo = r.rawLen > 0 && (r.kind == K_PROBE || r.kind == K_BEACON || r.kind == K_ASSOC || r.kind == K_PROBE_RESP);
    if (now - s->lastSent >= SEND_INTERVAL_MS || (hasInfo && now - s->lastSent >= 100)) {
      s->lastSent = now;
      emitRecord(r);
    }
  }

  if (now - gLastStat >= 1000) { gLastStat = now; emitStat(); }
  if (now - gLastDraw >= 1000) { gLastDraw = now; drawScreen(); }
  delay(1);
}
