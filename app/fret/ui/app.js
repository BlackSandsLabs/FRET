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
  renderRadar();
  const near = [...st.devices].filter(d => d.range).sort((a, b) => a.range.est - b.range.est).slice(0, 7);
  $('#nearest').innerHTML = near.length ? near.map(d => `<div class="li" data-key="${esc(d.key)}">
      <div class="tico" style="--c:${cvar(d.category)}">${ico(d.category)}</div>
      <div class="mid"><div class="t">${esc(title(d))}</div><div class="s">${esc(subtitle(d))} · <span class="mono">${esc(d.mac)}</span></div></div>
      <div class="dist">${fmtM(d.range.est)}<span>${fmtM(d.range.min)}–${fmtM(d.range.max)}</span></div></div>`).join('')
    : '<div class="muted" style="padding:20px 6px">Waiting for devices…</div>';
  $('#nearest').querySelectorAll('.li').forEach(el => el.onclick = () => openDevice(el.dataset.key));
  renderSpark();
}

function renderRadar() {
  const R = 280, st = S.state, svg = $('#radar');
  const rings = [1, 3, 8, 25, 60];
  let h = `<defs><radialGradient id="sw" cx="0" cy="0" r="1"><stop offset="0" stop-color="rgba(51,199,217,.28)"/><stop offset="1" stop-color="rgba(51,199,217,0)"/></radialGradient></defs>`;
  h += `<g class="sweep"><path d="M0 0 L${R} 0 A${R} ${R} 0 0 0 ${R * Math.cos(-0.6)} ${R * Math.sin(-0.6)} Z" fill="url(#sw)" opacity=".6"/></g>`;
  rings.forEach((m, i) => {
    const r = logpos(m) * R;
    h += `<circle class="ring ${m === 3 || m === 8 || m === 25 ? 'major' : ''}" r="${r}"/>`;
    h += `<text class="rl" x="6" y="${-r - 5}">${m} m</text>`;
  });
  h += `<line x1="${-R}" y1="0" x2="${R}" y2="0" stroke="rgba(255,255,255,.04)"/><line y1="${-R}" x1="0" y2="${R}" x2="0" stroke="rgba(255,255,255,.04)"/>`;
  const devs = st.devices.filter(d => d.range);
  for (const d of devs) {
    const a = hashAngle(d.mac), c = cvar(d.category);
    const r = logpos(d.range.est) * R, r1 = logpos(d.range.min) * R, r2 = logpos(d.range.max) * R;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    const fresh = d.age < 10;
    h += `<g class="dev ${S.sel === d.key ? 'sel' : ''}" data-key="${esc(d.key)}" opacity="${fresh ? 1 : 0.4}">
      <line class="arc" x1="${Math.cos(a) * r1}" y1="${Math.sin(a) * r1}" x2="${Math.cos(a) * r2}" y2="${Math.sin(a) * r2}" stroke="${c}" stroke-width="10"/>
      <circle class="core" cx="${x}" cy="${y}" r="${d.category === 'camera' ? 9 : 7}" fill="${c}"/></g>`;
  }
  h += `<circle class="center" r="7"/><circle r="14" fill="none" stroke="var(--accent)" stroke-opacity=".35"/>`;
  svg.innerHTML = h;
  const tip = $('#tip'), wrap = svg.parentElement;
  svg.querySelectorAll('.dev').forEach(g => {
    const d = devs.find(x => x.key === g.dataset.key);
    g.onmouseenter = e => { tip.innerHTML = `<b>${esc(title(d))}</b>${esc(d.category_label)} · ${fmtM(d.range.est)} (${fmtM(d.range.min)}–${fmtM(d.range.max)})<br><span class="mono muted">${esc(d.mac)}</span>`; tip.style.opacity = 1; };
    g.onmousemove = e => { const b = wrap.getBoundingClientRect(); tip.style.left = (e.clientX - b.left + 14) + 'px'; tip.style.top = (e.clientY - b.top + 14) + 'px'; };
    g.onmouseleave = () => tip.style.opacity = 0;
    g.onclick = () => openDevice(d.key);
  });
}

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
    toast(st.toast);
    render();
  } catch (e) { console.error(e); }
  finally { busy = false; }
}
hydrateIcons();
tick(); setInterval(tick, 1000);
