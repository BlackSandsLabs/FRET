/* Static-preview backend. Only active when the UI is opened without the
   Python engine and a recorded snapshot (window.FRET_PREVIEW_STATE) exists. */
(function () {
  const base = window.FRET_PREVIEW_STATE;
  if (!base) return;
  const t0 = Date.now() / 1000;
  const st = JSON.parse(JSON.stringify(base));
  const shift = t0 - Math.max(...st.devices.map(d => d.last_seen));
  st.devices.forEach(d => { d.first_seen += shift; d.last_seen += shift; d._base = d.rssi_last; });
  let caseObj = null, obs = 0, toastMsg = '';
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;
  function dist(d, rssi) {
    const ref = d.medium === 'wifi' ? st.settings.ref_1m.wifi : st.settings.ref_1m.ble;
    const n = { open: [1.8, 2.2, 2.7], indoor: [2.2, 2.8, 3.5], dense: [2.8, 3.5, 4.5] }[st.settings.environment];
    const f = (r, k) => Math.max(0.3, Math.min(500, Math.pow(10, (ref - r) / (10 * k))));
    const m = Math.max(3, d.range ? d.range.spread : 4);
    return { est: +f(rssi, n[1]).toFixed(1), min: +f(rssi + m, n[2]).toFixed(1), max: +f(rssi - m, n[0]).toFixed(1), rssi, spread: d.range ? d.range.spread : 4, n: 30 };
  }
  window.FRET_MOCK = {
    get_state() {
      const now = Date.now() / 1000;
      st.devices.forEach(d => {
        if (Math.random() < 0.55) {
          const r = Math.round(d._base + gauss() * 2);
          d.rssi_last = r; d.rssi_hist = [...d.rssi_hist.slice(-29), r]; d.last_seen = now; d.count++; obs++;
          const med = [...d.rssi_hist].sort((a, b) => a - b)[d.rssi_hist.length >> 1];
          d.range = dist(d, med);
        }
        d.age = +(now - d.last_seen).toFixed(1);
      });
      st.source.status = { ...st.source.status, ch: (st.source.status.ch % 13) + 1, wfps: +(80 + Math.random() * 50).toFixed(1), bleps: +(25 + Math.random() * 30).toFixed(1) };
      st.case = caseObj && { ...caseObj, observations: obs };
      const t = toastMsg; toastMsg = '';
      return Promise.resolve({ ...st, toast: t });
    },
    list_ports: () => Promise.resolve([{ device: 'COM5', description: 'USB JTAG/serial debug unit (Espressif)', likely: true }]),
    use_source: () => Promise.resolve({ ok: true }),
    send_command: () => Promise.resolve({ ok: true }),
    start_case(info) {
      if (!info.reference) return Promise.resolve({ ok: false, error: 'Case reference is required' });
      caseObj = { info, folder: 'C:\\Users\\Examiner\\Documents\\FRET Cases\\' + info.reference.replace(/[^\w.-]+/g, '_'), started: new Date().toISOString(), observations: 0 };
      obs = 0; toastMsg = `Case ${info.reference} opened - logging all observations`;
      return Promise.resolve({ ok: true });
    },
    end_case() { caseObj = null; toastMsg = 'Case closed and exported'; return Promise.resolve({ ok: true }); },
    export() {
      if (!caseObj) return Promise.resolve({ ok: false, error: 'Open a case first - exports are tied to a case log' });
      const h = () => Array.from({ length: 64 }, () => '0123456789abcdef'[Math.random() * 16 | 0]).join('');
      toastMsg = 'Export written and hashed (preview: hashes are placeholders)';
      return Promise.resolve({ ok: true, folder: caseObj.folder + '\\export_preview', hashes: { 'devices.csv': h(), 'devices.json': h(), 'observations.csv': h(), 'report.html': h() } });
    },
    annotate(key, note, flagged) { const d = st.devices.find(x => x.key === key); if (d) { if (note != null) d.note = note; if (flagged != null) d.flagged = flagged; } return Promise.resolve({ ok: true }); },
    set_setting(k, v) { st.settings[k] = v; return Promise.resolve({ ok: true }); },
    calibrate(key) { const d = st.devices.find(x => x.key === key); st.settings.ref_1m[d.medium] = d.rssi_last; toastMsg = `${d.medium.toUpperCase()} reference set to ${d.rssi_last} dBm at 1 m`; return Promise.resolve({ ok: true }); },
    update_oui: () => Promise.resolve({ ok: false, error: 'Not available in the preview' }),
    clear_devices: () => Promise.resolve({ ok: true }),
    open_folder: () => { toastMsg = 'Opens the case folder in Explorer (desktop app only)'; return Promise.resolve({ ok: true }); },
  };
})();
