/* FRET front end. Talks to the Python engine over its localhost HTTP API
   (desktop window and browser mode) or to FRET_MOCK (static preview). */
'use strict';

// ---------------------------------------------------------------- icons
const ICONS = {
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  cursor: '<path d="M5 3l14 7-6 2-2 6z"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  computer: '<rect x="3.5" y="4.5" width="17" height="11" rx="1.5"/><path d="M2 19.5h20"/>',
  camera: '<path d="M3 7.5l13-3 2 5.5-13 3z"/><path d="M16.5 10l4-1.5v5l-4-1.5"/><path d="M8 12.5l1 4H5.5v3"/>',
  wearable: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  ap: '<rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 17h.01M11 17h.01"/><path d="M8.5 10.5a5 5 0 0 1 7 0M6 8a8.5 8.5 0 0 1 12 0"/>',
  iot: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
  unknown: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17h.01"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  usb: '<path d="M12 3v14M8 7l4-4 4 4M7 12v2a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2M12 17v4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
};
const svgIco = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ICONS.unknown}</svg>`;
const ico = n => `<i data-ico="${n}">${svgIco(n)}</i>`;
function hydrateIcons(root = document) { root.querySelectorAll('i[data-ico]:empty').forEach(el => el.innerHTML = svgIco(el.dataset.ico)); }

const CATS = [
  ['phone', 'Phones / tablets'], ['computer', 'Computers'], ['camera', 'CCTV / cameras'],
  ['wearable', 'Wearables / audio'], ['ap', 'Access points'], ['iot', 'IoT / smart'],
];
const CAT_LABEL = Object.fromEntries([...CATS, ['unknown', 'Unidentified']]);
const cvar = c => `var(--c-${c})`;
const CAT_ONE = { phone: 'Phone / tablet', computer: 'Computer', camera: 'Camera', wearable: 'Wearable / audio', ap: 'Access point', iot: 'IoT device', unknown: 'Unknown device' };

// ---------------------------------------------------------------- api
let apiReady = true;
async function api(name, ...args) {
  if (window.FRET_MOCK && window.FRET_FORCE_MOCK) return window.FRET_MOCK[name](...args);
  try {
    const r = await fetch('/api/' + name, { method: 'POST', body: JSON.stringify(args) });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) {
    if (window.FRET_MOCK) { window.FRET_FORCE_MOCK = true; return window.FRET_MOCK[name](...args); }
    throw e;
  }
}

// ---------------------------------------------------------------- state
const S = {
  state: null, view: 'survey', sel: null, q: '', filter: 'all', medium: 'all',
  sort: 'range', asc: true, act: [], drawerKey: null, ports: [],
};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtM = m => m == null ? '–' : (m < 10 ? m.toFixed(1) : Math.round(m)) + ' m';
const ago = s => s < 2 ? 'now' : s < 60 ? Math.round(s) + 's ago' : s < 3600 ? Math.round(s / 60) + 'm ago' : Math.round(s / 3600) + 'h ago';
const utc = t => new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 19) + 'Z';

function toast(msg) {
  if (!msg) return;
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 3200);
}

// ---------------------------------------------------------------- nav
const TITLES = { survey: ['LIVE SURVEY', 'Survey'], devices: ['DISCOVERED', 'Devices'], case: ['EVIDENCE', 'Case'], settings: ['CONFIGURATION', 'Settings'] };
function go(view) {
  S.view = view;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + view));
  $('#eyebrow').textContent = TITLES[view][0]; $('#title').textContent = TITLES[view][1];
  if (view === 'settings') { api('list_ports').then(p => { S.ports = p || []; renderSettings(true); }); }
  if (view === 'case') renderCase(true);
  render();
}
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => go(b.dataset.view));
document.addEventListener('click', e => { const g = e.target.closest('[data-goto]'); if (g) go(g.dataset.goto); });
$('#q').addEventListener('input', e => { S.q = e.target.value.trim().toLowerCase(); if (S.view === 'survey' && S.q) go('devices'); else render(); });
$('#caseChip').onclick = () => go('case');

// ---------------------------------------------------------------- filtering
function visibleDevices() {
  const st = S.state; if (!st) return [];
  let ds = st.devices;
  if (S.filter !== 'all') ds = ds.filter(d => S.filter === 'flagged' ? d.flagged : d.category === S.filter);
  if (S.medium !== 'all') ds = ds.filter(d => d.medium === S.medium);
  if (S.q) ds = ds.filter(d => [d.mac, d.make, d.model, d.ssid_ap, d.category_label, d.note, ...(d.probed || []), d.ble?.name]
    .some(x => x && String(x).toLowerCase().includes(S.q)));
  const k = {
    range: d => d.range ? d.range.est : 1e9, rssi: d => -(d.rssi_last ?? -200), age: d => d.age,
    make: d => (d.model || d.make).toLowerCase(), mac: d => d.mac, category: d => d.category,
  }[S.sort];
  ds = [...ds].sort((a, b) => { const x = k(a), y = k(b); return (x < y ? -1 : x > y ? 1 : 0) * (S.asc ? 1 : -1); });
  return ds;
}
document.querySelectorAll('.tbl th').forEach(th => th.onclick = () => {
  const s = th.dataset.sort; if (S.sort === s) S.asc = !S.asc; else { S.sort = s; S.asc = s !== 'rssi' ? true : true; }
  render();
});

// ---------------------------------------------------------------- render: shared
function title(d) { return d.model || (d.randomized ? CAT_ONE[d.category] : d.make); }
function subtitle(d) {
  const make = d.make;
  return d.model ? make : (d.randomized ? (d.medium === 'ble' ? 'BLE · ' + (d.ble_addr || 'random') : 'Wi-Fi · randomised') : d.category_label);
}
function bars(rssi) {
  const lv = rssi == null ? 0 : rssi > -55 ? 4 : rssi > -67 ? 3 : rssi > -78 ? 2 : rssi > -88 ? 1 : 0;
  return `<span class="bars">${[5, 8, 11, 14].map((h, i) => `<b style="height:${h}px" class="${i < lv ? 'on' : ''}"></b>`).join('')}</span>`;
}
const LOGMAX = Math.log10(60), LOGMIN = Math.log10(0.5);
const logpos = m => Math.max(0, Math.min(1, (Math.log10(Math.max(m, 0.5)) - LOGMIN) / (LOGMAX - LOGMIN)));
function hashAngle(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 3600) / 3600 * Math.PI * 2; }

function renderRecv() {
  const st = S.state, src = st.source, stat = src.status || {}, h = src.hello || {};
  const cls = src.kind === 'demo' ? 'demo' : src.connected ? 'ok' : '';
  const model = st.receivers && st.receivers[st.settings.receiver];
  const name = src.kind === 'demo' ? 'Demo receiver' : (h.board || model || 'Receiver');
  $('#recv').innerHTML = `<div class="hd"><span class="st ${cls}"></span>${esc(name)}</div>
    ${src.connected ? `
    <div class="kv">Channel<b>${stat.ch ?? '–'} ${stat.hop === false ? '(locked)' : '· hopping'}</b></div>
    <div class="kv">Wi-Fi / BLE<b>${stat.wfps ?? 0} · ${stat.bleps ?? 0}/s</b></div>
    <div class="kv">Battery<b>${stat.bat ?? '–'}%</b></div>
    <div class="kv">Firmware<b class="mono">${esc(h.fw || '–')}</b></div>` :
    `<div class="err">${esc(src.error || 'Connecting…')}</div>`}`;
  const chip = $('#srcChip');
  chip.className = 'chip ' + (src.kind === 'demo' ? 'demo' : src.connected ? 'live' : 'off');
  chip.innerHTML = `<span class="d"></span>${src.kind === 'demo' ? 'DEMO DATA' : src.connected ? 'LIVE' : 'NO RECEIVER'}`;
  const cc = $('#caseChip'), c = st.case;
  cc.className = 'chip rec' + (c ? ' on' : '');
  cc.innerHTML = c ? `<span class="d"></span>REC · ${esc(c.info.reference)}` : `${ico('folder')}No case open`;
  $('#navRec').classList.toggle('on', !!c);
  $('#navCount').textContent = st.devices.length;
}

// ---------------------------------------------------------------- survey
function renderSurvey() {
  const st = S.state, counts = st.counts || {};
  $('#kpis').innerHTML = CATS.map(([c, l]) => `<div class="kpi" style="--c:${cvar(c)}" data-cat="${c}">
    <div class="ic">${ico(c)}</div><div class="n">${counts[c] || 0}</div><div class="l">${l}</div></div>`).join('');
  $('#kpis').querySelectorAll('.kpi').forEach(k => k.onclick = () => { S.filter = k.dataset.cat; go('devices'); });
  $('#envLabel').textContent = { open: 'Open-space model', indoor: 'Indoor model', dense: 'Dense-building model' }[st.settings.environment] || '';
  $('#mHead').textContent = M.mode === 'tri' ? 'Triangulated positions' : 'Range from your position';
  drawMap(); renderMapInfo();
  const near = [...st.devices].filter(d => d.range).sort((a, b) => a.range.est - b.range.est).slice(0, 7);
  $('#nearest').innerHTML = near.length ? near.map(d => {
    const f = M.mode === 'tri' && M.fits.get(d.key), rel = f && f.status === 'ok' && relTo(f);
    const dist = rel ? `${fmtM(rel.d)} ${rel.dir}<span>±${fmtM(f.r95)} · ${f.q}</span>` : `${fmtM(d.range.est)}<span>${fmtM(d.range.min)}–${fmtM(d.range.max)}</span>`;
    return `<div class="li" data-key="${esc(d.key)}" style="${M.sel === d.key ? 'background:var(--hover)' : ''}">
      <div class="tico" style="--c:${cvar(d.category)}">${ico(d.category)}</div>
      <div class="mid"><div class="t">${esc(title(d))}</div><div class="s">${esc(subtitle(d))} · <span class="mono">${esc(d.mac)}</span></div></div>
      <div class="dist">${dist}</div></div>`;
  }).join('')
    : '<div class="muted" style="padding:20px 6px">Waiting for devices…</div>';
  $('#nearest').querySelectorAll('.li').forEach(el => el.onclick = () => { M.sel = el.dataset.key; render(); });
  renderSpark();
}

// ---------------------------------------------------------------- map, position & triangulation
// Local frame: metres east (x) / north (y) of M.origin. Imagery: Esri World Imagery, Web Mercator tiles.
const DEMO_SITE = { lat: 51.47695, lon: -0.00055 };
const ENV_N = { open: 2.2, indoor: 2.8, dense: 3.5 };
const CAT_HEX = { phone: '#33c7d9', computer: '#8c8cff', camera: '#ff9e42', wearable: '#f27ec2', ap: '#4dd980', iot: '#ffcc4d', unknown: '#8a94a3' };
const hexA = (h, a) => `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const M = {
  origin: { ...DEMO_SITE }, me: { x: 0, y: 0, acc: null }, gps: null,
  geo: 'pending', src: 'gps', mode: 'range',
  view: { cx: 0, cy: 0, z: 19 }, zoomed: false, follow: true,
  sampling: false, track: [], walked: 0, spotSet: new Set(), tickN: 0,
  obs: new Map(), fits: new Map(), sel: null, hover: null,
  tiles: new Map(), tileOk: 0, tileErr: 0, noImagery: false, dismissed: new Set(),
  sim: { s: 0, timer: null, ox: 0, oy: 0 },
};
const R_LAT = 110574;
const cosLat = () => Math.cos(M.origin.lat * Math.PI / 180);
const toLL = (x, y) => ({ lat: M.origin.lat + y / R_LAT, lon: M.origin.lon + x / (111320 * cosLat()) });
const fromLL = (lat, lon) => ({ x: (lon - M.origin.lon) * 111320 * cosLat(), y: (lat - M.origin.lat) * R_LAT });
const mpp = () => 156543.03392 * cosLat() / 2 ** M.view.z;   // metres per CSS pixel
function worldPx(lat, lon, z) {
  const n = 256 * 2 ** z, s = Math.sin(lat * Math.PI / 180);
  return { x: (lon + 180) / 360 * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}
const nice = v => { const p = 10 ** Math.floor(Math.log10(v)); for (const f of [1, 2, 5, 10]) if (f * p >= v) return f * p; };
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function relTo(f) {
  const dx = f.x - M.me.x, dy = f.y - M.me.y, brg = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  return { d: Math.hypot(dx, dy), brg: Math.round(brg), dir: DIRS[Math.round(brg / 45) % 8] };
}

const cv = $('#map'), mctx = cv.getContext('2d');
let CW = 0, CH = 0;
function sizeMap() {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  if (!r.width || !r.height) return false;
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  CW = r.width; CH = r.height; mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return true;
}
const scr = (x, y) => { const m = mpp(); return [CW / 2 + (x - M.view.cx) / m, CH / 2 - (y - M.view.cy) / m]; };
const unscr = (sx, sy) => { const m = mpp(); return [M.view.cx + (sx - CW / 2) * m, M.view.cy - (sy - CH / 2) * m]; };

function tile(z, x, y) {
  const k = z + '/' + x + '/' + y; let t = M.tiles.get(k);
  if (!t) {
    t = new Image();
    t.onload = () => { M.tileOk++; drawMap(); };
    t.onerror = () => { t.bad = true; M.tileErr++; if (M.tileErr >= 4 && !M.tileOk) M.noImagery = true; drawMap(); };
    t.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
    M.tiles.set(k, t);
    if (M.tiles.size > 300) M.tiles.delete(M.tiles.keys().next().value);
  }
  return t;
}
function drawTiles() {
  const zi = clamp(Math.round(M.view.z), 3, 19), s = 2 ** (M.view.z - zi), ts = 256 * s;
  const c = toLL(M.view.cx, M.view.cy), W = worldPx(c.lat, c.lon, zi);
  const x0 = Math.floor((W.x - CW / 2 / s) / 256), x1 = Math.floor((W.x + CW / 2 / s) / 256);
  const y0 = Math.floor((W.y - CH / 2 / s) / 256), y1 = Math.floor((W.y + CH / 2 / s) / 256);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const t = tile(zi, tx, ty);
    if (t.complete && !t.bad && t.naturalWidth) mctx.drawImage(t, (tx * 256 - W.x) * s + CW / 2, (ty * 256 - W.y) * s + CH / 2, ts + 0.6, ts + 0.6);
  }
}
function drawGrid() {
  const m = mpp(), step = nice(m * 70), [ax, ay] = unscr(0, CH), [bx, by] = unscr(CW, 0), c = mctx;
  c.lineWidth = 1;
  for (let x = Math.floor(ax / step) * step; x <= bx; x += step) {
    const [sx] = scr(x, 0); c.strokeStyle = Math.round(x / step) % 5 ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.11)';
    c.beginPath(); c.moveTo(Math.round(sx) + .5, 0); c.lineTo(Math.round(sx) + .5, CH); c.stroke();
  }
  for (let y = Math.floor(ay / step) * step; y <= by; y += step) {
    const [, sy] = scr(0, y); c.strokeStyle = Math.round(y / step) % 5 ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.11)';
    c.beginPath(); c.moveTo(0, Math.round(sy) + .5); c.lineTo(CW, Math.round(sy) + .5); c.stroke();
  }
}
function label(text, x, y, color) {
  const c = mctx; c.font = '600 12px ' + getComputedStyle(document.body).fontFamily;
  const w = c.measureText(text).width + 12;
  c.fillStyle = 'rgba(13,20,29,.88)'; c.beginPath(); c.roundRect(x - w / 2, y - 11, w, 22, 6); c.fill();
  c.strokeStyle = hexA(color, .7); c.lineWidth = 1; c.stroke();
  c.fillStyle = '#f2f5f7'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y + .5);
}
function fitZoom(radiusM) { return clamp(Math.log2(156543.03392 * cosLat() / (radiusM / Math.max(80, Math.min(CW, CH) / 2 - 24))), 14, 21.5); }

let drawQueued = false, pendingLabel = null;
function drawMap() { if (!drawQueued) { drawQueued = true; requestAnimationFrame(() => { drawQueued = false; paintMap(); }); } }
function paintMap() {
  if (S.view !== 'survey' || !S.state || !sizeMap()) return;
  if (!M.zoomed) { M.view.z = fitZoom(35); M.zoomed = true; }
  if (M.follow && M.me) { M.view.cx = M.me.x; M.view.cy = M.me.y; }
  const c = mctx;
  c.fillStyle = '#0b1219'; c.fillRect(0, 0, CW, CH);
  if (!M.tileOk) drawGrid();
  if (!M.noImagery) { drawTiles(); if (M.tileOk) { c.fillStyle = 'rgba(6,10,16,.3)'; c.fillRect(0, 0, CW, CH); } }
  pendingLabel = null;
  if (M.mode === 'range') drawRange(); else drawTri();
  drawMe(); drawScale();
  if (pendingLabel) label(...pendingLabel);   // labels go on top of every marker
  cv.classList.toggle('place', M.src === 'tap');
  $('#mAttr').textContent = M.tileOk ? 'Imagery © Esri, Maxar, Earthstar Geographics' : '';
}

function drawRange() {
  const c = mctx, m = mpp(), [sx, sy] = scr(M.me.x, M.me.y);
  const devs = S.state.devices.filter(d => d.range);
  const hot = devs.filter(d => d.key === M.sel || d.key === M.hover);
  for (const d of devs) {
    if (hot.includes(d)) continue;
    c.strokeStyle = hexA(CAT_HEX[d.category] || CAT_HEX.unknown, d.age < 10 ? .42 : .15); c.lineWidth = 1.5;
    c.beginPath(); c.arc(sx, sy, d.range.est / m, 0, Math.PI * 2); c.stroke();
  }
  for (const d of hot) {
    const col = CAT_HEX[d.category] || CAT_HEX.unknown, r = d.range;
    c.fillStyle = hexA(col, .16); c.beginPath();
    c.arc(sx, sy, r.max / m, 0, Math.PI * 2); c.arc(sx, sy, r.min / m, 0, Math.PI * 2, true); c.fill();
    c.strokeStyle = col; c.lineWidth = 2.5; c.beginPath(); c.arc(sx, sy, r.est / m, 0, Math.PI * 2); c.stroke();
    pendingLabel = [`${title(d)} · ${fmtM(r.est)}`, sx, sy - r.est / m, col];
  }
}

function drawTri() {
  const c = mctx, m = mpp();
  if (M.track.length > 1) {
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 2; c.setLineDash([2, 5]); c.beginPath();
    M.track.forEach((p, i) => { const [x, y] = scr(p.x, p.y); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); c.setLineDash([]);
  }
  const sf = M.sel && M.fits.get(M.sel);
  if (sf && sf.status === 'ok') {
    const d = S.state.devices.find(x => x.key === M.sel);
    if (!sf.heat) sf.heat = heatCanvas(sf, CAT_HEX[d?.category] || CAT_HEX.unknown);
    const [x0, y0] = scr(sf.gx0, sf.gy0 + sf.size);
    c.imageSmoothingEnabled = true; c.drawImage(sf.heat, x0, y0, sf.size / m, sf.size / m);
  }
  for (const [k, f] of M.fits) {
    if (f.status !== 'ok') continue;
    const d = S.state.devices.find(x => x.key === k); if (!d) continue;
    const col = CAT_HEX[d.category] || CAT_HEX.unknown, [x, y] = scr(f.x, f.y), on = k === M.sel || k === M.hover;
    if (!on && f.q === 'rough') continue;
    c.fillStyle = hexA(col, on ? .14 : .07); c.strokeStyle = hexA(col, on ? .95 : .5); c.lineWidth = on ? 2 : 1.2;
    c.beginPath(); c.ellipse(x, y, Math.max(2, f.ra / m), Math.max(2, f.rb / m), -f.ang, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  for (const [k, f] of M.fits) {
    if (f.status !== 'ok') continue;
    const d = S.state.devices.find(x => x.key === k); if (!d) continue;
    const col = CAT_HEX[d.category] || CAT_HEX.unknown, [x, y] = scr(f.x, f.y), on = k === M.sel || k === M.hover;
    const rough = f.q === 'rough' && !on;
    c.fillStyle = rough ? 'rgba(10,15,23,.7)' : col; c.strokeStyle = on ? '#fff' : rough ? col : '#0a0f17'; c.lineWidth = on ? 3 : 2;
    c.beginPath(); c.arc(x, y, d.category === 'camera' ? 8 : 6.5, 0, Math.PI * 2); c.fill(); c.stroke();
    if (k === M.sel) {
      const [mx, my] = scr(M.me.x, M.me.y), rel = relTo(f);
      c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1.5; c.setLineDash([6, 5]);
      c.beginPath(); c.moveTo(mx, my); c.lineTo(x, y); c.stroke(); c.setLineDash([]);
      pendingLabel = [`${title(d)} · ${fmtM(rel.d)} ${rel.dir} ±${fmtM(f.r95)}`, x, y - 22, col];
    }
  }
}
function heatCanvas(f, col) {
  const N = f.N, el = document.createElement('canvas'); el.width = el.height = N;
  const cx = el.getContext('2d'), im = cx.createImageData(N, N);
  const r = parseInt(col.slice(1, 3), 16), g = parseInt(col.slice(3, 5), 16), b = parseInt(col.slice(5, 7), 16);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = ((N - 1 - j) * N + i) * 4, p = f.p[j * N + i];
    im.data[o] = r; im.data[o + 1] = g; im.data[o + 2] = b; im.data[o + 3] = Math.round(190 * Math.sqrt(p));
  }
  cx.putImageData(im, 0, 0); return el;
}
function drawMe() {
  const c = mctx, m = mpp(), [x, y] = scr(M.me.x, M.me.y);
  if (M.me.acc) { c.fillStyle = 'rgba(51,199,217,.12)'; c.strokeStyle = 'rgba(51,199,217,.5)'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, M.me.acc / m, 0, Math.PI * 2); c.fill(); c.stroke(); }
  c.fillStyle = 'rgba(51,199,217,.25)'; c.beginPath(); c.arc(x, y, 14, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#33c7d9'; c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill(); c.stroke();
}
function drawScale() {
  const c = mctx, m = mpp(), len = nice(100 * m), px = len / m, x = 14, y = CH - 18;
  c.fillStyle = 'rgba(13,20,29,.75)'; c.beginPath(); c.roundRect(x - 6, y - 20, px + 12, 30, 6); c.fill();
  c.strokeStyle = '#f2f5f7'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y - 5); c.lineTo(x, y); c.lineTo(x + px, y); c.lineTo(x + px, y - 5); c.stroke();
  c.fillStyle = '#f2f5f7'; c.font = '600 11px ' + getComputedStyle(document.body).fontFamily; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillText(len >= 1000 ? len / 1000 + ' km' : len + ' m', x, y - 8);
}

// ---- solver: for each grid cell, fit the 1 m reference level in closed form, score the residual
function solve(rec, medium) {
  const bins = new Map();
  for (const o of rec.obs) {
    const k = Math.round(o.x / 1.5) + ',' + Math.round(o.y / 1.5); let b = bins.get(k);
    if (!b) bins.set(k, b = { x: 0, y: 0, r: [] }); b.x += o.x; b.y += o.y; b.r.push(o.r);
  }
  const sts = [...bins.values()].map(b => { const r = [...b.r].sort((p, q) => p - q); return { x: b.x / r.length, y: b.y / r.length, r: r[r.length >> 1], w: 1 / (16 + 16 / r.length) }; });
  const n = rec.obs.length, spots = sts.length;
  if (spots < 4 || n < 8) return { status: 'few', n, spots };
  let mx = 0, my = 0; sts.forEach(s => { mx += s.x; my += s.y; }); mx /= spots; my /= spots;
  const spread = 2 * Math.max(...sts.map(s => Math.hypot(s.x - mx, s.y - my)));
  if (spread < 3) return { status: 'spread', n, spots, spread };
  const set = S.state.settings, k10 = 10 * (ENV_N[set.environment] || 2.8), A0 = set.ref_1m[medium] ?? -50, wA = 1 / 100;
  const dNear = 10 ** ((A0 - Math.max(...sts.map(s => s.r))) / k10);
  const half = clamp(spread / 2 + 2.5 * dNear + 8, 25, 160), N = 64, step = 2 * half / N, gx0 = mx - half, gy0 = my - half;
  const cost = new Float64Array(N * N); let best = Infinity, bi = 0;
  for (let j = 0; j < N; j++) {
    const py = gy0 + (j + .5) * step;
    for (let i = 0; i < N; i++) {
      const px = gx0 + (i + .5) * step;
      let sw = wA, s1 = A0 * wA, s2 = A0 * A0 * wA;   // calibrated 1 m level as a soft prior (±10 dB)
      for (const s of sts) { const rp = s.r + k10 * Math.log10(Math.max(0.7, Math.hypot(px - s.x, py - s.y))); sw += s.w; s1 += rp * s.w; s2 += rp * rp * s.w; }
      const cst = s2 - s1 * s1 / sw, k = j * N + i; cost[k] = cst; if (cst < best) { best = cst; bi = k; }
    }
  }
  const bx = gx0 + (bi % N + .5) * step, by = gy0 + (((bi / N) | 0) + .5) * step;
  const p = new Float32Array(N * N); let tot = 0, sxx = 0, sxy = 0, syy = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, w = Math.exp(-(cost[k] - best) / 2), dx = gx0 + (i + .5) * step - bx, dy = gy0 + (j + .5) * step - by;
    p[k] = w; tot += w; sxx += w * dx * dx; sxy += w * dx * dy; syy += w * dy * dy;
  }
  sxx = sxx / tot + step * step / 12; syy = syy / tot + step * step / 12; sxy /= tot;
  const T = (sxx + syy) / 2, D = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy), l1 = T + D, l2 = Math.max(1e-6, T - D);
  const ra = 2.45 * Math.sqrt(l1), rb = 2.45 * Math.sqrt(l2), edge = bi % N === 0 || bi % N === N - 1 || bi < N || bi >= N * (N - 1);
  const q = edge || ra > 15 ? 'rough' : ra > 6 ? 'fair' : 'good';
  return { status: 'ok', x: bx, y: by, ra, rb, r95: ra, ang: 0.5 * Math.atan2(2 * sxy, sxx - syy), q, n, spots, spread, p, N, gx0, gy0, size: 2 * half };
}
function solveAll() {
  for (const [k, rec] of M.obs) { const d = S.state.devices.find(x => x.key === k); if (d) M.fits.set(k, solve(rec, d.medium)); }
}
function sampleTick() {
  if (M.mode !== 'tri' || !M.sampling || !S.state) return;
  if (M.src === 'gps' && (M.me.acc ?? 99) > 30) return;
  const { x, y } = M.me, last = M.track[M.track.length - 1];
  if (!last || Math.hypot(x - last.x, y - last.y) > 0.3) {
    if (last) M.walked += Math.hypot(x - last.x, y - last.y);
    M.track.push({ x, y }); if (M.track.length > 3000) M.track.shift();
    M.spotSet.add(Math.round(x / 1.5) + ',' + Math.round(y / 1.5));
  }
  for (const d of S.state.devices) {
    if (d.age > 1.5 || d.rssi_last == null) continue;
    let r = M.obs.get(d.key); if (!r) M.obs.set(d.key, r = { obs: [], seen: 0 });
    if (d.last_seen === r.seen) continue;
    r.seen = d.last_seen; r.obs.push({ x, y, r: d.rssi_last }); if (r.obs.length > 800) r.obs.shift();
  }
  if (++M.tickN % 2 === 0) solveAll();
}

// ---- position sources
function setMe(x, y, acc) {
  M.me = { x, y, acc: acc ?? null };
  // Demo sources move their simulated signals with you; the real receiver ignores this.
  if (S.state?.source?.kind === 'demo') Promise.resolve(api('set_position', x, y)).catch(() => {});
}
function startGeo() {
  if (!navigator.geolocation) return geoFail();
  try {
    navigator.geolocation.watchPosition(p => {
      const { latitude: lat, longitude: lon, accuracy } = p.coords;
      if (M.geo !== 'ok') { M.geo = 'ok'; if (!M.track.length) { M.origin = { lat, lon }; M.tileOk = 0; M.tileErr = 0; M.noImagery = false; } }
      const q = fromLL(lat, lon); M.gps = { x: q.x, y: q.y, acc: accuracy };
      if (M.src === 'gps') setMe(q.x, q.y, accuracy);
      render();
    }, geoFail, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  } catch (e) { geoFail(); }
}
function geoFail() { if (M.geo === 'ok') return; M.geo = 'denied'; if (M.src === 'gps') M.src = 'tap'; render(); }
const SIM_PATH = [[0, 0], [16, 0], [16, 12], [-9, 12], [-9, -8], [7, -8], [7, 3], [0, 0]];
function simAt(s) {
  const segs = SIM_PATH.slice(1).map((p, i) => [SIM_PATH[i], p, Math.hypot(p[0] - SIM_PATH[i][0], p[1] - SIM_PATH[i][1])]);
  let t = s % segs.reduce((a, g) => a + g[2], 0);
  for (const [a, b, L] of segs) { if (t <= L) return [a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L]; t -= L; }
  return SIM_PATH[0];
}
function startSim() {
  if (M.sim.timer) return;
  if (M.sim.s === 0) { M.sim.ox = M.me.x; M.sim.oy = M.me.y; }
  M.sim.timer = setInterval(() => { M.sim.s += 1.3 * 0.2; const [x, y] = simAt(M.sim.s); setMe(x + M.sim.ox, y + M.sim.oy, null); drawMap(); }, 200);
}
function stopSim() { clearInterval(M.sim.timer); M.sim.timer = null; }
function setSrc(v) {
  if (v === 'gps' && M.geo !== 'ok') { toast(M.geo === 'denied' ? 'Location isn\'t available here. Use Tap to place or Simulate walk.' : 'Still waiting for a location fix'); return; }
  M.src = v; stopSim();
  if (v === 'gps' && M.gps) setMe(M.gps.x, M.gps.y, M.gps.acc);
  if (v === 'sim' && M.sampling && M.mode === 'tri') startSim();
  M.follow = true; render();
}
function setSampling(on) {
  M.sampling = on;
  if (on && M.src === 'sim') startSim(); else stopSim();
  render();
}
function resetWalk() {
  setSampling(false); M.track = []; M.walked = 0; M.spotSet.clear(); M.obs.clear(); M.fits.clear(); M.sim.s = 0;
  toast('Walk cleared'); render();
}

// ---- map chrome: toolbar, notes, info card
function renderMapChrome() {
  document.querySelectorAll('#mMode button').forEach(b => b.classList.toggle('on', b.dataset.v === M.mode));
  document.querySelectorAll('#mSrc button').forEach(b => {
    b.classList.toggle('on', b.dataset.v === M.src);
    if (b.dataset.v === 'gps') { b.disabled = M.geo === 'denied'; b.title = M.geo === 'denied' ? 'Location isn\'t available in this view' : 'Use this computer\'s location'; }
  });
  const tri = M.mode === 'tri';
  $('#mWalk').hidden = !tri; $('#mReset').hidden = !tri;
  $('#mWalk').innerHTML = M.sampling ? `${ico('stop')}<span>Pause walk</span>` : `${ico('play')}<span>${M.track.length ? 'Resume walk' : 'Start walk'}</span>`;
  $('#mWalk').classList.toggle('primary', !M.sampling);
  const located = [...M.fits.values()].filter(f => f.status === 'ok' && f.q !== 'rough').length;
  const pos = M.src === 'gps' ? (M.me.acc ? `GPS ±${Math.round(M.me.acc)} m` : 'GPS') : M.src === 'sim' ? 'Simulated' : 'Placed by tap';
  let stat = tri ? `${M.spotSet.size} spots · ${Math.round(M.walked)} m walked · ${located} located · ${pos}` : `${pos}${M.geo === 'denied' ? ' · demo site' : ''}`;
  if (tri && M.sampling && M.src === 'gps' && (M.me.acc ?? 99) > 30) stat = `GPS ±${Math.round(M.me.acc ?? 99)} m is too coarse to sample. Use Tap to place.`;
  $('#mStat').textContent = stat;
  const notes = [];
  if (M.geo === 'denied' && !M.dismissed.has('geo')) notes.push(['geo', '<b>Location unavailable.</b> This view can\'t read your position, so the survey is centred on a demo site. Use Tap to place or Simulate walk.']);
  if (M.geo === 'pending') notes.push(['wait', 'Finding your location…']);
  if (M.noImagery && !M.dismissed.has('img')) notes.push(['img', '<b>Satellite imagery didn\'t load.</b> A metric grid is shown at the same scale. Imagery needs an internet connection.']);
  const n = $('#mNote'); n.hidden = !notes.length;
  n.innerHTML = notes.map(([, h]) => `<p>${h}</p>`).join('') + (notes.some(([k]) => k !== 'wait') ? '<button class="x" aria-label="Dismiss">×</button>' : '');
  n.dataset.keys = notes.map(([k]) => k).join(',');
  $('#mFoot').textContent = !tri
    ? 'Each ring is a true-scale distance from your position, estimated from signal strength. One position can\'t give direction, so devices show as rings. Switch to Triangulate and walk to fix them as points.'
    : M.src === 'tap' ? 'Tap the map where you are standing, wait a few seconds, then move 3–5 m and tap again. Cover two directions, not a straight line. Ellipses show 95% confidence; the shading shows where the selected device could be.'
    : M.src === 'sim' ? 'Demo: walks a simulated loop through the scene so you can watch positions converge. Ellipses show 95% confidence; the shading shows where the selected device could be.'
    : 'Walk a loop or an L-shape around the area. FRET records each device\'s signal at every spot and solves for the point that best explains the readings. GPS is good to a few metres outdoors; indoors, use Tap to place.';
}
function renderMapInfo() {
  renderMapChrome();
  const el = $('#mapInfo'), d = M.sel && S.state.devices.find(x => x.key === M.sel);
  if (!d) { el.hidden = true; return; }
  el.hidden = false;
  const f = M.fits.get(d.key), r = d.range;
  let body;
  if (M.mode === 'tri') {
    if (f && f.status === 'ok') {
      const rel = relTo(f);
      body = `<div class="big">${fmtM(rel.d)} ${rel.dir}<span class="q ${f.q}">${f.q.toUpperCase()}</span></div>
        <div class="muted">from you, bearing ${rel.brg}° · ±${fmtM(f.r95)} (95%)</div>
        <div class="faint">${f.n} readings from ${f.spots} spots${f.q === 'rough' ? '. Walk at right angles to your path to tighten this.' : ''}</div>`;
    } else body = `<div class="big">Not located yet</div><div class="muted">${!f ? (M.sampling ? 'No readings yet. Keep moving.' : 'Start a walk to collect readings.') : f.status === 'few' ? `Readings from ${f.spots} of 4 spots needed. Keep moving.` : `Your spots are within ${fmtM(f.spread)} of each other. Move at least 3 m further.`}</div>`;
  } else body = r ? `<div class="big">${fmtM(r.est)}</div><div class="muted">likely ${fmtM(r.min)}–${fmtM(r.max)} · direction unknown</div>` : '<div class="muted">No range yet</div>';
  el.innerHTML = `<div class="hd"><div class="tico" style="--c:${cvar(d.category)}">${ico(d.category)}</div><div style="min-width:0"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(title(d))}</div><div class="faint mono">${esc(d.mac)}</div></div><button class="x" data-act="close" aria-label="Close">×</button></div>${body}<button class="btn" data-act="open">Device details</button>`;
}
$('#mapInfo').onclick = e => { const a = e.target.closest('[data-act]'); if (!a) return; if (a.dataset.act === 'close') { M.sel = null; render(); } else openDevice(M.sel); };
$('#mNote').onclick = e => { if (e.target.closest('.x')) { $('#mNote').dataset.keys.split(',').forEach(k => M.dismissed.add(k)); render(); } };
$('#mMode').onclick = e => { const b = e.target.closest('button'); if (!b) return; M.mode = b.dataset.v; if (M.mode !== 'tri') stopSim(); else if (M.sampling && M.src === 'sim') startSim(); render(); };
$('#mSrc').onclick = e => { const b = e.target.closest('button'); if (b && !b.disabled) setSrc(b.dataset.v); };
$('#mWalk').onclick = () => setSampling(!M.sampling);
$('#mReset').onclick = () => confirmModal('Clear this walk?', 'Removes the recorded track, every reading taken on it and all triangulated positions. Case logs are not affected.', 'Clear walk', async () => resetWalk());
$('#mIn').onclick = () => zoomAt(CW / 2, CH / 2, 0.75);
$('#mOut').onclick = () => zoomAt(CW / 2, CH / 2, -0.75);
$('#mMe').onclick = () => { M.follow = true; drawMap(); };

// ---- pointer: drag to pan, wheel to zoom, click to select or place
function zoomAt(sx, sy, dz) {
  const [wx, wy] = unscr(sx, sy); M.view.z = clamp(M.view.z + dz, 14, 21.5);
  const [wx2, wy2] = unscr(sx, sy); M.view.cx += wx - wx2; M.view.cy += wy - wy2;
  if (Math.abs(sx - CW / 2) > 2 || Math.abs(sy - CH / 2) > 2) M.follow = false;
  drawMap();
}
function hitTest(sx, sy) {
  if (!S.state) return null;
  let best = null, bd;
  if (M.mode === 'tri') {
    bd = 14;
    for (const [k, f] of M.fits) if (f.status === 'ok') { const [x, y] = scr(f.x, f.y), dd = Math.hypot(x - sx, y - sy); if (dd < bd) { bd = dd; best = k; } }
  } else {
    bd = 5; const [cx, cy] = scr(M.me.x, M.me.y), rp = Math.hypot(sx - cx, sy - cy), m = mpp();
    for (const d of S.state.devices) if (d.range) { const dd = Math.abs(rp - d.range.est / m); if (dd < bd) { bd = dd; best = d.key; } }
  }
  return best;
}
let drag = null;
cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, clamp(-e.deltaY * 0.0025, -0.6, 0.6)); }, { passive: false });
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, cx: M.view.cx, cy: M.view.cy, moved: false }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => {
  const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, tip = $('#tip');
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; M.follow = false; cv.classList.add('drag'); tip.style.opacity = 0; }
    if (drag.moved) { const m = mpp(); M.view.cx = drag.cx - dx * m; M.view.cy = drag.cy + dy * m; drawMap(); }
    return;
  }
  const h = hitTest(sx, sy);
  if (h !== M.hover) { M.hover = h; drawMap(); }
  const d = h && S.state.devices.find(x => x.key === h);
  if (d) {
    const f = M.fits.get(h), rel = M.mode === 'tri' && f?.status === 'ok' && relTo(f);
    tip.innerHTML = `<b>${esc(title(d))}</b>${esc(d.category_label)} · ${rel ? `${fmtM(rel.d)} ${rel.dir} ±${fmtM(f.r95)}` : d.range ? `${fmtM(d.range.est)} (${fmtM(d.range.min)}–${fmtM(d.range.max)})` : ''}<br><span class="mono muted">${esc(d.mac)}</span>`;
    tip.style.left = Math.min(sx + 14, CW - 240) + 'px'; tip.style.top = (sy + 14) + 'px'; tip.style.opacity = 1;
  } else tip.style.opacity = 0;
});
cv.addEventListener('pointerup', e => {
  cv.classList.remove('drag'); const d = drag; drag = null; if (!d || d.moved) return;
  const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, h = hitTest(sx, sy);
  if (h) { M.sel = h; render(); return; }
  if (M.src === 'tap') { const [x, y] = unscr(sx, sy); setMe(x, y, null); render(); return; }
  if (M.sel) { M.sel = null; render(); }
});
cv.addEventListener('pointerleave', () => { if (!drag) { M.hover = null; $('#tip').style.opacity = 0; drawMap(); } });
new ResizeObserver(() => drawMap()).observe($('#mapwrap'));

function renderSpark() {
  const a = S.act.slice(-60), W = 300, H = 70, N = Math.max(1, a.length - 1);
  const mx = Math.max(10, ...a.map(x => Math.max(x.w, x.b)));
  const path = k => a.map((x, i) => `${i ? 'L' : 'M'}${(i / N) * W} ${H - 4 - (x[k] / mx) * (H - 10)}`).join(' ');
  $('#spark').innerHTML = a.length > 1 ? `<path d="${path('w')}" fill="none" stroke="var(--accent)" stroke-width="2"/><path d="${path('b')}" fill="none" stroke="var(--lab)" stroke-width="2"/>` : '';
  const l = a[a.length - 1]; $('#actNow').textContent = l ? `${l.w} / ${l.b} per s` : '';
}

// ---------------------------------------------------------------- devices
function renderFilters() {
  const st = S.state, counts = st.counts || {}, flagged = st.devices.filter(d => d.flagged).length;
  const chips = [['all', 'All', st.devices.length, 'var(--accent)'], ...CATS.map(([c, l]) => [c, l, counts[c] || 0, cvar(c)]),
    ['unknown', 'Unidentified', counts.unknown || 0, cvar('unknown')], ['flagged', 'Flagged', flagged, 'var(--bad)']];
  $('#filters').innerHTML = chips.map(([k, l, n, c]) => `<button class="fchip ${S.filter === k ? 'on' : ''}" style="--c:${c}" data-f="${k}"><b></b>${l}<span class="n">${n}</span></button>`).join('')
    + `<span class="spacer"></span><div class="seg fchip-seg">${[['all', 'All radios'], ['wifi', 'Wi-Fi'], ['ble', 'Bluetooth']].map(([k, l]) => `<button data-m="${k}" class="${S.medium === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  $('#filters').querySelectorAll('[data-f]').forEach(b => b.onclick = () => { S.filter = b.dataset.f; render(); });
  $('#filters').querySelectorAll('[data-m]').forEach(b => b.onclick = () => { S.medium = b.dataset.m; render(); });
}

function renderRows() {
  const ds = visibleDevices();
  document.querySelectorAll('.tbl th').forEach(th => { th.classList.toggle('sorted', th.dataset.sort === S.sort); th.classList.toggle('asc', S.asc); });
  $('#emptyRows').hidden = ds.length > 0;
  $('#rows').innerHTML = ds.map(d => {
    const r = d.range, c = cvar(d.category);
    const band = r ? `<div class="band" style="--c:${c}"><span style="left:${logpos(r.min) * 100}%;right:${100 - logpos(r.max) * 100}%"></span></div>` : '';
    return `<tr data-key="${esc(d.key)}" class="${S.sel === d.key ? 'sel' : ''} ${d.age > 30 ? 'stale' : ''}">
      <td><div class="tcell"><div class="tico" style="--c:${c}" title="${esc(d.category_label)} · ${d.confidence}%">${ico(d.category)}</div><div style="min-width:0"><div class="t">${esc(title(d))}${d.flagged ? '<span class="tag flag">FLAG</span>' : ''}</div><div class="s">${esc(subtitle(d))}</div></div></div></td>
      <td class="nw"><div class="mono">${esc(d.mac)}</div><div class="s">${d.medium === 'ble' ? 'BLE' : 'Wi-Fi'}${d.randomized ? '<span class="tag rand">RANDOM</span>' : `<span class="tag">${esc(d.vendor_block || 'OUI')}</span>`}${d.linked?.length ? `<span class="tag link">+${d.linked.length} LINKED</span>` : ''}</div></td>
      <td class="distcell"><b>${r ? fmtM(r.est) : '–'}</b><div class="s">${r ? `${fmtM(r.min)} – ${fmtM(r.max)}` : ''}</div>${band}</td>
      <td class="nw">${bars(d.rssi_last)}<span class="mono">${d.rssi_last ?? '–'} dBm</span></td>
      <td class="nw"><div>${ago(d.age)}</div><div class="s">${d.count} obs</div></td></tr>`;
  }).join('');
  $('#rows').querySelectorAll('tr').forEach(tr => tr.onclick = () => select(tr.dataset.key));
}

function select(key) { S.sel = key; renderRows(); renderDrawer(true); }
function openDevice(key) { S.sel = key; S.filter = 'all'; go('devices'); renderDrawer(true); setTimeout(() => document.querySelector(`tr[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'center' }), 30); }

function renderDrawer(full) {
  const el = $('#drawer'), d = S.state?.devices.find(x => x.key === S.sel);
  if (!d) {
    if (S.drawerKey !== null || full) { el.innerHTML = `<div class="empty">${ico('cursor')}<b>No device selected</b>Pick a device to see evidence, range and notes.</div>`; S.drawerKey = null; }
    return;
  }
  const c = cvar(d.category), r = d.range;
  if (!full && S.drawerKey === d.key) { updateDrawerLive(d); return; }
  S.drawerKey = d.key;
  const kv = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
  const wps = d.wps || {}, ble = d.ble || {};
  el.innerHTML = `
  <div class="dhead" style="--c:${c}">
    <div class="row"><div class="tico">${ico(d.category)}</div><div style="min-width:0"><h2>${esc(title(d))}</h2><div class="s">${esc(d.category_label)} · <span class="mono">${esc(d.mac)}</span></div></div></div>
    <div class="acts">
      <button class="btn ${d.flagged ? 'on' : ''}" id="dFlag">${ico('flag')}${d.flagged ? 'Flagged' : 'Flag'}</button>
      <button class="btn" id="dCal" title="Hold this device 1 m from the receiver, then press">${ico('target')}Calibrate 1 m</button>
      <button class="btn" id="dCopy">${ico('copy')}Copy</button>
    </div>
  </div>
  <div class="dsec" style="--c:${c}"><h3>Estimated distance</h3>
    <div class="bigdist"><b id="dEst">${r ? fmtM(r.est) : '–'}</b><span id="dBand">${r ? `likely ${fmtM(r.min)} – ${fmtM(r.max)}` : ''}</span></div>
    <div class="scale"><div class="track"></div><div class="rng" id="dRng"></div><div class="pt" id="dPt"></div></div>
    <div class="scale-l"><span>0.5 m</span><span>3 m</span><span>8 m</span><span>25 m</span><span>60 m</span></div>
    <svg id="dspark" viewBox="0 0 300 46" preserveAspectRatio="none" style="margin-top:10px"></svg>
    <div class="muted" style="font-size:12px" id="dRssi"></div>
  </div>
  <div class="dsec" style="--c:${c}"><h3>Triangulated position</h3><div id="dLoc" style="font-size:13px;line-height:1.5"></div></div>
  <div class="dsec" style="--c:${c}"><h3>Identification</h3>
    <dl class="kvs">
      ${kv('Make', esc(d.randomized && !d.ble?.company ? 'Not available (randomised address)' : d.make))}
      ${kv('Registry', d.randomized ? '' : esc(`IEEE ${d.vendor_block}`))}
      ${kv('Model hint', d.model ? `${esc(d.model)} <span class="faint">(${esc(d.model_src)})</span>` : '<span class="faint">None broadcast</span>')}
      ${kv('Address', d.medium === 'ble' ? `BLE ${esc(d.ble_addr)}` : (d.randomized ? 'Wi-Fi, locally administered (randomised)' : 'Wi-Fi, globally unique'))}
      ${kv('Type', `${esc(d.category_label)} · ${d.confidence}%`)}
    </dl>
    <div class="conf"><span style="width:${d.confidence}%"></span></div>
    <ul class="reasons">${(d.reasons.length ? d.reasons : ['No classifying evidence yet']).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
  </div>
  <div class="dsec"><h3>Broadcast details</h3><dl class="kvs">
    ${kv('First seen', `<span class="mono">${utc(d.first_seen)}</span>`)}
    ${kv('Observations', `<span id="dCount">${d.count}</span>`)}
    ${kv('Channels', d.channels.join(', '))}
    ${kv('Frames', Object.entries(d.kinds).map(([k, v]) => `${k} ${v}`).join(' · '))}
    ${kv('Network name', esc(d.ssid_ap))}
    ${kv('Connected to', d.bssids.map(esc).join('<br>'))}
    ${kv('WPS', [wps.manufacturer, wps.model_name, wps.model_number, wps.device_category].filter(Boolean).map(esc).join(' · '))}
    ${kv('BLE name', esc(ble.name))}
    ${kv('BLE company', esc(ble.company))}
    ${kv('Apple type', esc(ble.apple_type))}
    ${kv('BLE services', (ble.services || []).map(esc).join(', '))}
    ${kv('TX power', ble.tx_power != null ? ble.tx_power + ' dBm' : '')}
    ${kv('Fingerprint', d.fingerprint ? `<span class="mono">${esc(d.fingerprint)}</span>` : '')}
  </dl>
  ${d.probed.length ? `<h3 style="margin-top:12px">Networks searched for</h3><div class="chips">${d.probed.map(s => `<span>${esc(s)}</span>`).join('')}</div>` : ''}
  ${d.linked.length ? `<h3 style="margin-top:12px">Possibly the same device</h3><div class="muted" style="font-size:12px;margin-bottom:6px">Other randomised addresses with an identical probe fingerprint.</div><div class="chips">${d.linked.map(m => `<span class="mono">${esc(m)}</span>`).join('')}</div>` : ''}
  </div>
  <div class="dsec"><h3>Examiner note</h3><textarea class="note" id="dNote" placeholder="Add an observation (saved to the case audit trail)">${esc(d.note)}</textarea></div>`;
  $('#dFlag').onclick = async () => { await api('annotate', d.key, null, !d.flagged); await tick(); renderDrawer(true); };
  $('#dCal').onclick = () => confirmModal('Calibrate range at 1 m', 'Place this device 1 metre from the receiver stick with a clear line of sight. FRET will use its current signal level as the 1 m reference for all ' + (d.medium === 'ble' ? 'Bluetooth' : 'Wi-Fi') + ' devices.', 'Calibrate', async () => { const res = await api('calibrate', d.key, 1.0); if (!res.ok) toast(res.error); });
  $('#dCopy').onclick = () => { navigator.clipboard?.writeText(d.mac); toast('MAC copied'); };
  let t; $('#dNote').oninput = e => { clearTimeout(t); t = setTimeout(() => api('annotate', d.key, e.target.value, null), 600); };
  updateDrawerLive(d);
}

function updateDrawerLive(d) {
  const r = d.range;
  if (r) {
    $('#dEst').textContent = fmtM(r.est); $('#dBand').textContent = `likely ${fmtM(r.min)} – ${fmtM(r.max)}`;
    $('#dRng').style.left = logpos(r.min) * 100 + '%'; $('#dRng').style.right = (100 - logpos(r.max) * 100) + '%';
    $('#dPt').style.left = logpos(r.est) * 100 + '%';
    $('#dRssi').textContent = `Median ${r.rssi} dBm · spread ±${r.spread} dB · ${r.n} readings (last 30 s) · last seen ${ago(d.age)}`;
  }
  const h = d.rssi_hist, W = 300, H = 46;
  if (h.length > 1) {
    const lo = Math.min(...h) - 3, hi = Math.max(...h) + 3;
    const p = h.map((v, i) => `${i ? 'L' : 'M'}${(i / (h.length - 1)) * W} ${H - 3 - ((v - lo) / (hi - lo)) * (H - 6)}`).join(' ');
    $('#dspark').innerHTML = `<path d="${p} L${W} ${H} L0 ${H}Z" fill="${cvar(d.category)}" opacity=".12"/><path d="${p}" fill="none" stroke="${cvar(d.category)}" stroke-width="2"/>`;
  }
  const cnt = $('#dCount'); if (cnt) cnt.textContent = d.count;
  const loc = $('#dLoc');
  if (loc) {
    const f = M.fits.get(d.key);
    if (f && f.status === 'ok') {
      const rel = relTo(f), ll = toLL(f.x, f.y);
      loc.innerHTML = `<div class="bigdist"><b style="font-size:24px">${fmtM(rel.d)} ${rel.dir}</b><span>±${fmtM(f.r95)} (95%)<span class="q ${f.q}">${f.q.toUpperCase()}</span></span></div>
        <div class="muted">Bearing ${rel.brg}° from your position · ${f.n} readings from ${f.spots} spots</div>
        <div class="mono faint" style="margin-top:4px">${ll.lat.toFixed(6)}, ${ll.lon.toFixed(6)}${M.geo === 'ok' ? '' : ' (demo site)'}</div>`;
    } else loc.innerHTML = `<span class="muted">${f ? (f.status === 'few' ? `Readings from ${f.spots} of 4 spots so far.` : 'Readings are too close together. Move further.') : 'Not located. Use Triangulate on the Survey map and walk the area.'}</span>`;
  }
}

// ---------------------------------------------------------------- case
function renderCase(full) {
  const st = S.state; if (!st) return;
  const c = st.case, el = $('#caseBody');
  if (!full && el.dataset.mode === (c ? 'open' : 'closed')) {
    if (c) { $('#cObs').textContent = c.observations.toLocaleString(); $('#cDev').textContent = st.devices.length; $('#cDur').textContent = dur(c.started); }
    return;
  }
  el.dataset.mode = c ? 'open' : 'closed';
  if (!c) {
    const s = st.settings;
    el.innerHTML = `<div class="casewrap">
      <div class="card"><div class="sechead"><span>Open a case</span></div>
        <div class="field"><label>Case / job reference *</label><input id="fRef" placeholder="e.g. OP-2026-0142"></div>
        <div class="row2"><div class="field"><label>Examiner</label><input id="fEx" value="${esc(s.examiner)}"></div>
        <div class="field"><label>Agency / organisation</label><input id="fAg" value="${esc(s.agency)}"></div></div>
        <div class="field"><label>Location</label><input id="fLoc" placeholder="Address or description of the receiver position"></div>
        <div class="field"><label>Notes</label><textarea id="fNotes" rows="3" placeholder="Purpose, authority, conditions…"></textarea></div>
        <button class="btn primary" id="fStart">${ico('play')}Start logging</button>
      </div>
      <div class="col"><div class="card"><div class="sechead"><span>What gets recorded</span></div>
        <div class="notice">Every frame and advertisement the receiver forwards is written to a SQLite log with a UTC timestamp, together with an audit trail of examiner actions (settings, calibration, notes, flags, exports).<br><br>
        Exports produce a device table (CSV, JSON), the raw observation log, and an HTML report. Each file is SHA-256 hashed into <span class="mono">SHA256SUMS.txt</span> and the audit trail.<br><br>
        Collection is passive by default. The receiver stick only listens and never connects to any device; the optional active Bluetooth scan is the only thing that transmits, and it is logged.</div></div>
        <div class="card"><div class="sechead"><span>Case folders</span></div><div class="muted" style="font-size:13px;margin-bottom:10px">Saved under Documents\\FRET Cases</div><button class="btn" id="fOpen">${ico('open')}Open folder</button></div></div>
    </div>`;
    $('#fStart').onclick = async () => {
      const info = { reference: $('#fRef').value, examiner: $('#fEx').value, agency: $('#fAg').value, location: $('#fLoc').value, notes: $('#fNotes').value };
      const r = await api('start_case', info); if (!r.ok) return toast(r.error); await tick(); renderCase(true);
    };
    $('#fOpen').onclick = () => api('open_folder', null);
  } else {
    el.innerHTML = `<div class="casewrap">
      <div class="full recbanner"><span class="d"></span><div><b>Recording to case ${esc(c.info.reference)}</b><div class="muted" style="font-size:12.5px">Started ${esc(c.started)} · ${esc(c.folder)}</div></div></div>
      <div class="card"><div class="sechead"><span>Case</span></div>
        <div class="statgrid"><div class="stat"><b id="cObs">${c.observations.toLocaleString()}</b><span>observations</span></div>
        <div class="stat"><b id="cDev">${st.devices.length}</b><span>devices</span></div><div class="stat"><b id="cDur">${dur(c.started)}</b><span>duration</span></div></div>
        <dl class="kvs">${Object.entries(c.info).filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k[0].toUpperCase() + k.slice(1))}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      </div>
      <div class="card"><div class="sechead"><span>Actions</span></div>
        <div style="display:flex;flex-direction:column;gap:10px;align-items:flex-start">
          <button class="btn primary" id="cExp">${ico('download')}Export &amp; hash now</button>
          <button class="btn" id="cOpen">${ico('open')}Open case folder</button>
          <button class="btn danger" id="cEnd">${ico('stop')}End case</button>
        </div><div id="cHashes" class="hashes"></div></div>
    </div>`;
    $('#cExp').onclick = async () => { const r = await api('export'); if (!r.ok) return toast(r.error); showHashes(r); };
    $('#cOpen').onclick = () => api('open_folder', null);
    $('#cEnd').onclick = () => confirmModal('End case?', 'FRET will write a final export, hash it and close the log. Capture continues, but nothing more is recorded to this case.', 'End case', async () => {
      const r = await api('end_case'); await tick(); renderCase(true); if (r.export) toast('Final export: ' + r.export.folder);
    });
  }
}
function showHashes(r) { $('#cHashes').innerHTML = `<div style="margin-top:14px;color:var(--text)">${esc(r.folder)}</div>` + Object.entries(r.hashes).map(([n, h]) => `<div>${esc(n)}<br>${h}</div>`).join(''); }
function dur(iso) { const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h}h ${m}m` : `${m}m ${Math.floor(s % 60)}s`; }

// ---------------------------------------------------------------- settings
function renderSettings(full) {
  const st = S.state; if (!st || !full) return;
  const s = st.settings, src = st.source, stat = src.status || {};
  const rx = st.receivers || {};
  const rxSel = s.receiver || 'auto';
  const portOpts = [['auto', 'Auto-detect the stick'], ...S.ports.map(p => [p.device, `${p.device} — ${p.board_name || p.description}${p.board_name ? ' ★' : (p.likely ? ' (USB serial)' : '')}`]), ['demo', 'Demo (simulated devices)']];
  const cur = src.kind === 'demo' ? 'demo' : (src.selection || 'auto');
  $('#settingsBody').innerHTML = `
  <div class="card"><div class="sechead"><span>Receiver</span></div>
    <div class="field"><label>Receiver model</label><div class="seg" id="sRx">${[['auto', 'Auto'], ...Object.entries(rx)].map(([k, l]) => `<button data-v="${k}" class="${rxSel === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
      <div class="hint">Auto finds either stick. Choose a model if more than one USB serial device is plugged in. Once connected, the stick reports its own model on the receiver card.</div></div>
    <div class="field"><label>Source</label><select id="sSrc">${portOpts.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <div class="hint">Connect the stick by USB-C. The M5StickC Plus2 appears as a CH9102 USB serial port (install the WCH CH9102 driver if no port is listed); the StickS3 appears as an Espressif USB device.</div></div>
    <div class="field"><label>Wi-Fi channel</label><select id="sCh"><option value="AUTO">Hop all channels 1–13</option>${Array.from({ length: 13 }, (_, i) => `<option value="${i + 1}" ${stat.hop === false && stat.ch === i + 1 ? 'selected' : ''}>Lock to channel ${i + 1}</option>`).join('')}</select>
      <div class="hint">Lock to one channel to follow a single device more closely, e.g. a camera on its access point's channel.</div></div>
    <div class="field"><label>Dwell per channel: <span id="sDwV">${s.dwell_ms}</span> ms</label><input type="range" id="sDw" min="100" max="1000" step="50" value="${s.dwell_ms}"></div>
    <div class="trow"><div><div class="t">Bluetooth LE scanning</div><div class="s">Listen for Bluetooth advertisements</div></div><button class="toggle ${stat.ble !== false ? 'on' : ''}" id="sBle"></button></div>
    <div class="trow"><div><div class="t">Active Bluetooth scan</div><div class="s">Asks nearby devices for their names and models. The stick transmits short scan requests, so collection is no longer fully passive. Recorded in the audit trail.</div></div><button class="toggle ${s.ble_active ? 'on' : ''}" id="sBleA"></button></div>
  </div>
  <div class="card"><div class="sechead"><span>Range model</span></div>
    <div class="field"><label>Environment</label><div class="seg" id="sEnv">${[['open', 'Open space'], ['indoor', 'Indoor'], ['dense', 'Dense building']].map(([k, l]) => `<button data-v="${k}" class="${s.environment === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="hint">Sets the path-loss exponent. Walls and people absorb signal, so in the same building the same RSSI means a shorter distance.</div></div>
    <div class="row2"><div class="field"><label>Wi-Fi RSSI at 1 m</label><input type="number" id="sRw" value="${s.ref_1m.wifi}" step="0.5"></div>
    <div class="field"><label>BLE RSSI at 1 m</label><input type="number" id="sRb" value="${s.ref_1m.ble}" step="0.5"></div></div>
    <div class="hint">Calibrate from any device's panel by holding it 1 m from the receiver. If a BLE device advertises its TX power, FRET uses that instead.</div>
  </div>
  <div class="card"><div class="sechead"><span>Display</span></div>
    <div class="trow"><div><div class="t">Keep devices that have gone quiet</div><div class="s">Otherwise hidden after the timeout below</div></div><button class="toggle ${s.show_stale ? 'on' : ''}" id="sStale"></button></div>
    <div class="field"><label>Hide after (seconds)</label><input type="number" id="sStaleS" value="${s.stale_after_s}" min="10" step="10"></div>
    <button class="btn" id="sClear">Clear device list</button><div class="hint" style="margin-top:6px">Clears the screen only. Case logs are never altered.</div>
  </div>
  <div class="card"><div class="sechead"><span>Vendor database</span></div>
    <div class="statgrid" style="grid-template-columns:1fr 1fr"><div class="stat"><b>${st.oui_entries.toLocaleString()}</b><span>IEEE assignments</span></div><div class="stat"><b>MA-L/M/S</b><span>block sizes</span></div></div>
    <div class="hint mono" style="margin-bottom:10px;word-break:break-all">${esc(st.oui_path)}</div>
    <button class="btn" id="sOui">${ico('download')}Update from IEEE</button>
    <div class="hint" style="margin-top:8px">Downloads the current registries from standards-oui.ieee.org (needs internet).</div>
  </div>
  <div class="card full"><div class="sechead"><span>About</span></div><div class="notice">FRET ${esc(st.version)}. Make comes from the IEEE registry entry for the address prefix. Modern phones randomise their Wi-Fi and Bluetooth addresses, which have no registry entry, so FRET classifies them from behaviour and broadcast content instead and shows its reasoning. Model names appear only when a device broadcasts them, through WPS, a Bluetooth name or Apple Continuity.</div></div>`;
  const set = (k, v) => api('set_setting', k, v);
  $('#sSrc').onchange = e => { api('use_source', e.target.value); toast('Switching source…'); };
  $('#sRx').querySelectorAll('button').forEach(b => b.onclick = async () => { await set('receiver', b.dataset.v); $('#sRx').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); S.ports = await api('list_ports') || []; toast(b.dataset.v === 'auto' ? 'Detecting either receiver' : 'Looking for ' + rx[b.dataset.v]); });
  $('#sCh').onchange = e => api('send_command', 'CH ' + e.target.value);
  $('#sDw').oninput = e => $('#sDwV').textContent = e.target.value;
  $('#sDw').onchange = e => set('dwell_ms', +e.target.value);
  $('#sBle').onclick = e => { const on = !e.currentTarget.classList.contains('on'); e.currentTarget.classList.toggle('on', on); api('send_command', on ? 'BLE ON' : 'BLE OFF'); };
  $('#sBleA').onclick = e => { const on = !e.currentTarget.classList.contains('on'); e.currentTarget.classList.toggle('on', on); set('ble_active', on); toast(on ? 'Active Bluetooth scan on - device names will start appearing' : 'Bluetooth back to passive listening'); };
  $('#sEnv').querySelectorAll('button').forEach(b => b.onclick = () => { set('environment', b.dataset.v); $('#sEnv').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); });
  const refs = () => set('ref_1m', { wifi: +$('#sRw').value, ble: +$('#sRb').value });
  $('#sRw').onchange = refs; $('#sRb').onchange = refs;
  $('#sStale').onclick = e => { const on = !e.currentTarget.classList.contains('on'); e.currentTarget.classList.toggle('on', on); set('show_stale', on); };
  $('#sStaleS').onchange = e => set('stale_after_s', Math.max(10, +e.target.value));
  $('#sClear').onclick = () => api('clear_devices');
  $('#sOui').onclick = async e => { e.currentTarget.disabled = true; toast('Downloading IEEE registries…'); const r = await api('update_oui'); toast(r.ok ? `Vendor database updated: ${r.entries.toLocaleString()} entries` : r.error); renderSettings(true); };
}

// ---------------------------------------------------------------- modal
function confirmModal(t, p, ok, fn) {
  const m = $('#modal'); m.hidden = false;
  m.innerHTML = `<div class="box"><h4>${esc(t)}</h4><p>${esc(p)}</p><div class="acts"><button class="btn" id="mC">Cancel</button><button class="btn primary" id="mO">${esc(ok)}</button></div></div>`;
  $('#mC').onclick = () => m.hidden = true;
  $('#mO').onclick = async () => { m.hidden = true; await fn(); };
}

// ---------------------------------------------------------------- loop
function render() {
  if (!S.state) return;
  renderRecv();
  if (S.view === 'survey') renderSurvey();
  if (S.view === 'devices') { renderFilters(); renderRows(); renderDrawer(false); }
  if (S.view === 'case') renderCase(false);
}
let busy = false;
async function tick() {
  if (!apiReady || busy) return; busy = true;
  try {
    const st = await api('get_state');
    S.state = st;
    const stat = st.source.status || {};
    S.act.push({ w: Math.round(stat.wfps || 0), b: Math.round(stat.bleps || 0) }); if (S.act.length > 120) S.act.shift();
    sampleTick();
    toast(st.toast);
    render();
  } catch (e) { console.error(e); }
  finally { busy = false; }
}
hydrateIcons();
startGeo();
tick(); setInterval(tick, 1000);
