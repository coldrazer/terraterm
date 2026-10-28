/* TERRATERM core utilities: rng, dom, formatting, bus, storage, timing. */
(function () {
  'use strict';
  const TT = (window.TT = window.TT || {});
  TT.VERSION = '0.2.0';

  /* ---------- random and math ---------- */
  TT.rng = function (seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  TT.hash = function (str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  TT.gauss = function (rnd) {
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  TT.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  TT.lerp = (a, b, t) => a + (b - a) * t;
  TT.round = (v, d) => { const p = Math.pow(10, d); return Math.round(v * p) / p; };
  TT.pearson = function (a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 3) return 0;
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
    return da && db ? num / Math.sqrt(da * db) : 0;
  };

  /* ---------- DOM ---------- */
  TT.h = function (tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  };
  function append(el, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach((k) => append(el, k)); return; }
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  TT.$ = (sel, root) => (root || document).querySelector(sel);
  TT.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  TT.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  TT.setText = function (el, txt) { if (el && el.textContent !== txt) el.textContent = txt; };
  TT.isTyping = function (el) {
    el = el || document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  };
  TT.cssVar = function (name, el) { return getComputedStyle(el || document.documentElement).getPropertyValue(name).trim(); };
  TT.fitCanvas = function (canvas, w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W; canvas.height = H;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  };

  /* ---------- formatting §9 ---------- */
  const nfCache = {};
  const nf = (d) => nfCache[d] || (nfCache[d] = new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const MINUS = '−';
  const signed = (v, s) => (v > 0 ? '+' : v < 0 ? MINUS : '') + s;
  TT.decimalsFor = (kind) => (kind === 'fx' ? 4 : kind === 'yield' ? 3 : 2);
  TT.fmt = {
    num(v, d) { return Number.isFinite(v) ? nf(d == null ? 2 : d).format(v) : '—'; },
    int(v) { return Number.isFinite(v) ? nf(0).format(Math.round(v)) : '—'; },
    price(v, kind) { return TT.fmt.num(v, TT.decimalsFor(kind)); },
    pct(v, d) { if (!Number.isFinite(v)) return '—'; return signed(v, nf(d == null ? 2 : d).format(Math.abs(v * 100)) + '%'); },
    bp(deltaPct) { if (!Number.isFinite(deltaPct)) return '—'; return signed(deltaPct, nf(1).format(Math.abs(deltaPct * 100)) + 'bp'); },
    delta(v, d) { if (!Number.isFinite(v)) return '—'; return signed(v, nf(d == null ? 2 : d).format(Math.abs(v))); },
    chg(q) { return q.kind === 'yield' ? TT.fmt.bp(q.chg) : TT.fmt.pct(q.chgPct); },
    mm(v) { return TT.fmt.num(v, 1); },
    conf(v) { v = typeof v === 'string' ? parseFloat(v) : v; return Number.isFinite(v) ? v.toFixed(2) : '—'; },
    utc(ts, sec) {
      const d = new Date(ts);
      const p = (n) => String(n).padStart(2, '0');
      return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + (sec === false ? '' : ':' + p(d.getUTCSeconds())) + 'Z';
    },
    utcDate(ts) {
      const d = new Date(ts);
      const p = (n) => String(n).padStart(2, '0');
      return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + 'Z';
    },
    day(ts) {
      return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    },
    age(ts, now) {
      const s = Math.max(0, Math.round(((now || Date.now()) - ts) / 1000));
      if (s < 60) return s + 's';
      const m = Math.round(s / 60);
      if (m < 60) return m + 'm';
      const h = Math.round(m / 60);
      if (h < 48) return h + 'h';
      return Math.round(h / 24) + 'd';
    },
    tokens(n) { if (!Number.isFinite(n)) return '—'; return n >= 1e6 ? TT.round(n / 1e6, 2) + 'M' : n >= 1000 ? Math.round(n / 1000) + 'K' : String(Math.round(n)); },
  };
  TT.dir = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');
  TT.tri = (v) => (v > 0 ? '▲' : v < 0 ? '▼' : '■');

  /* ---------- event bus ---------- */
  const handlers = new Map();
  TT.bus = {
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, new Set());
      handlers.get(evt).add(fn);
      return () => handlers.get(evt).delete(fn);
    },
    emit(evt, data) {
      const set = handlers.get(evt);
      if (!set) return;
      for (const fn of Array.from(set)) {
        try { fn(data); } catch (err) { console.error('[TERRATERM] handler error on', evt, err); }
      }
    },
  };

  /* ---------- storage (never throws) ---------- */
  const PREFIX = 'terraterm.v1.';
  TT.store = {
    get(k, d) { try { const v = localStorage.getItem(PREFIX + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(PREFIX + k); } catch (e) { /* noop */ } },
    clear() {
      try { Object.keys(localStorage).filter((k) => k.indexOf(PREFIX) === 0).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* noop */ }
    },
  };

  /* ---------- timing ---------- */
  TT.throttle = function (fn, ms) {
    let last = 0, timer = null, pending = null;
    const run = function () { timer = null; last = performance.now(); const a = pending; pending = null; if (a) fn.apply(null, a); };
    const t = function () {
      pending = Array.from(arguments);
      const now = performance.now();
      if (now - last >= ms && !timer) { run(); }
      else if (!timer) timer = setTimeout(run, Math.max(0, ms - (now - last)));
    };
    t.flush = function () { if (timer) { clearTimeout(timer); run(); } };
    return t;
  };
  TT.debounce = function (fn, ms) {
    let timer = null;
    return function () { const a = arguments; clearTimeout(timer); timer = setTimeout(() => fn.apply(null, a), ms); };
  };
  TT.sleep = (ms, signal) => new Promise((res, rej) => {
    const t = setTimeout(res, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
  TT.motionReduced = () => document.documentElement.dataset.motion === 'reduce';

  /* ---------- fuzzy search ---------- */
  TT.fuzzy = function (q, text) {
    q = (q || '').toLowerCase().trim();
    if (!q) return 1;
    const t = String(text).toLowerCase();
    const idx = t.indexOf(q);
    if (idx >= 0) {
      const boundary = idx === 0 || /[^a-z0-9]/.test(t[idx - 1]);
      return 1000 - idx * 2 + (boundary ? 120 : 0) - (t.length - q.length) * 0.2;
    }
    let ti = 0, score = 0, streak = 0;
    for (const ch of q) {
      if (ch === ' ') continue;
      const f = t.indexOf(ch, ti);
      if (f < 0) return -1;
      streak = f === ti ? streak + 1 : 0;
      score += 1 + streak * 3 - (f - ti) * 0.05;
      ti = f + 1;
    }
    return score;
  };

  /* ---------- labels that come from the backend (never hardcoded in the UI) ---------- */
  const modelBy = (re) => { const s = TT.app && TT.app.system; const m = s && s.models && s.models.find((x) => re.test(x.role || '')); return m || null; };
  TT.labels = {
    agentModel() { const c = (TT.app && TT.app.config) || {}; if (c.agentModel) return c.agentModel; const m = modelBy(/reason|agent|chat|llm/i); return m ? m.name : 'Agent'; },
    agentWhere() { const m = modelBy(/reason|agent|chat|llm/i); return m && m.where ? m.where : ''; },
    segModel() { const c = (TT.app && TT.app.config) || {}; if (c.segmentationModel) return c.segmentationModel; const m = modelBy(/segment|vision|detect/i); return m ? m.name : ''; },
    prompts() {
      const c = (TT.app && TT.app.config) || {};
      if (Array.isArray(c.agentPrompts) && c.agentPrompts.length) return c.agentPrompts;
      if (TT.app && TT.app.mode === 'scaffold' && TT.mock && TT.mock.agentPrompts) return TT.mock.agentPrompts;
      return ['Brief me', 'What is diverging from vol?', 'What changed since the last pass?', 'What is pinned?'];
    },
  };

  /* ---------- market clock ---------- */
  // NYSE full-day closures and 1:00 pm ET early closes, from the NYSE Group 2026-2028 calendar.
  // A backend can replace these with TERRATERM.config.marketHolidays / marketEarlyCloses (arrays of 'YYYY-MM-DD').
  TT.NYSE = {
    holidays: ['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
      '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
      '2028-01-17', '2028-02-21', '2028-04-14', '2028-05-29', '2028-06-19', '2028-07-04', '2028-09-04', '2028-11-23', '2028-12-25'],
    earlyCloses: ['2026-11-27', '2026-12-24', '2027-11-26', '2028-07-03', '2028-11-24'],
  };
  // Outside the published years, derive the calendar from the standing NYSE rules (ad-hoc closures cannot be predicted).
  const ymd = (y, m, d) => y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  const dow = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const nthDow = (y, m, wd, n) => { const first = dow(y, m, 1); return 1 + ((wd - first + 7) % 7) + (n - 1) * 7; };
  const lastDow = (y, m, wd) => { const days = new Date(Date.UTC(y, m, 0)).getUTCDate(); const last = dow(y, m, days); return days - ((last - wd + 7) % 7); };
  function easter(y) { // anonymous Gregorian computus
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    return { m: Math.floor((h + l - 7 * m + 114) / 31), d: ((h + l - 7 * m + 114) % 31) + 1 };
  }
  function observed(y, m, d) { const w = dow(y, m, d); if (w === 6) { const t = new Date(Date.UTC(y, m - 1, d - 1)); return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); } if (w === 0) return ymd(y, m, d + 1); return ymd(y, m, d); }
  TT.NYSE.rules = function (y) {
    const e = easter(y), gf = new Date(Date.UTC(y, e.m - 1, e.d - 2));
    const h = [];
    if (dow(y, 1, 1) !== 6) h.push(observed(y, 1, 1)); // a Saturday New Year is not moved back into December
    h.push(ymd(y, 1, nthDow(y, 1, 1, 3)), ymd(y, 2, nthDow(y, 2, 1, 3)), ymd(y, gf.getUTCMonth() + 1, gf.getUTCDate()), ymd(y, 5, lastDow(y, 5, 1)),
      observed(y, 6, 19), observed(y, 7, 4), ymd(y, 9, nthDow(y, 9, 1, 1)), ymd(y, 11, nthDow(y, 11, 4, 4)), observed(y, 12, 25));
    const early = [ymd(y, 11, nthDow(y, 11, 4, 4) + 1)];
    const w3 = dow(y, 7, 3); if (w3 >= 1 && w3 <= 4) early.push(ymd(y, 7, 3));
    const w24 = dow(y, 12, 24); if (w24 >= 1 && w24 <= 4) early.push(ymd(y, 12, 24));
    return { holidays: h, earlyCloses: early.sort() };
  };
  const PUBLISHED = [2026, 2027, 2028];
  const calFor = (date) => { const y = Number(date.slice(0, 4)); return PUBLISHED.indexOf(y) >= 0 ? TT.NYSE : TT.NYSE.rules(y); };
  const nyFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: 'numeric', hour12: false });
  TT.marketState = function (ts) {
    const parts = {};
    nyFmt.formatToParts(new Date(ts)).forEach((p) => { parts[p.type] = p.value; });
    const wd = parts.weekday;
    const date = parts.year + '-' + parts.month + '-' + parts.day;
    const cfg = (TT.app && TT.app.config) || {};
    const cal = calFor(date);
    const holidays = cfg.marketHolidays || cal.holidays;
    const early = cfg.marketEarlyCloses || cal.earlyCloses;
    const mins = (parseInt(parts.hour, 10) % 24) * 60 + parseInt(parts.minute, 10);
    if (holidays.indexOf(date) >= 0) return { open: false, label: 'HOLIDAY', venue: 'NYSE' };
    const close = early.indexOf(date) >= 0 ? 780 : 960;
    const open = wd !== 'Sat' && wd !== 'Sun' && mins >= 570 && mins < close;
    return { open: open, label: open ? (close === 780 ? 'OPEN · EARLY CLOSE' : 'OPEN') : 'CLOSED', venue: 'NYSE', early: close === 780 };
  };
})();
