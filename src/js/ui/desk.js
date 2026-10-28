/* Desk (§8.1): six-panel grid. Watchlist+Wire, Macro+Orbital, Agent, Capital Flow, Event Timeline, System.
   Panels resize (gutter handles) and reorder (drag headers or Alt+Shift+Arrows); layout is saved per user (§4 v0.2). */
(function () {
  'use strict';
  const TT = window.TT;
  const H = TT.h;
  const F = TT.fmt;
  const app = () => TT.app;
  const ORDER = ['watch', 'macro', 'agent', 'flow', 'timeline', 'system'];
  const KPI = [['Index', 'SPX'], ['Commodity', 'CL1'], ['Metal', 'HG1'], ['Yield', 'US10Y'], ['Dollar', 'DXY'], ['Vol', 'VIX']];
  TT.KPI = KPI;

  /* ---------- shared bits ---------- */
  TT.kpiCard = function (slot, sym, opts) {
    opts = opts || {};
    const v = H('span', { class: 'k-v', text: '—' });
    const c = H('span', { class: 'k-c flat', text: '—' });
    const el = H(opts.button === false ? 'div' : 'button', { class: 'kpi', type: opts.button === false ? null : 'button', dataset: { sym: sym }, 'data-src': 'Source: ' + (opts.src || 'feed') }, H('span', { class: 'k-l', text: slot + ' · ' + sym }), v, c);
    el.set = function (value, kind, chg, chgPct, label) {
      TT.setText(v, value == null ? '—' : (kind === 'yield' ? F.price(value, 'yield') + '%' : F.price(value, kind)));
      const delta = kind === 'yield' ? chg : chgPct;
      c.className = 'k-c ' + TT.dir(delta);
      TT.setText(c, TT.tri(delta) + ' ' + (kind === 'yield' ? F.bp(chg) : F.pct(chgPct)) + (label ? ' ' + label : ''));
    };
    return el;
  };
  TT.chgCell = function (td, q) {
    const d = q.kind === 'yield' ? q.chg : q.chgPct;
    const cls = 'num ' + TT.dir(d);
    if (td.className !== cls) td.className = cls;
    TT.setText(td, TT.tri(d) + ' ' + F.chg(q));
  };

  /* ---------- panel: watchlist + wire ---------- */
  function watchPanel() {
    const p = TT.ui.panel({ id: 'watch', title: 'WATCHLIST', sub: 'feed', noscroll: true });
    const tbody = H('tbody');
    const table = H('table', { class: 'tbl', role: 'grid', 'aria-label': 'Watchlist. Enter pins a row to agent context. Delete removes it.' },
      H('colgroup', null, H('col', { style: { width: '62px' } }), H('col', { class: 'c-spark', style: { width: '68px' } }), H('col'), H('col', { style: { width: '84px' } })),
      H('thead', null, H('tr', null, H('th', { scope: 'col' }, 'SYM'), H('th', { scope: 'col', class: 'c-spark' }, '4H'), H('th', { scope: 'col', class: 'num' }, 'LAST'), H('th', { scope: 'col', class: 'num' }, 'CHG'))), tbody);
    const wrap = H('div', { class: 'tbl-wrap', style: { flex: '3 1 0' } }, table);
    TT.ui.skeletonRows(tbody, 4, 12);
    const skelUntil = Date.now() + 400;
    const rows = new Map();
    let built = '';
    function build() {
      const key = app().watch.join(',');
      if (key === built && rows.size) return;
      built = key;
      rows.clear();
      if (!app().watch.length) { tbody.replaceChildren(H('tr', null, H('td', { colspan: '4', class: 'empty' }, 'Pin symbols to build your watchlist.'))); return; }
      tbody.replaceChildren.apply(tbody, app().watch.map((sym, k) => {
        const q = app().quotes.get(sym);
        const tr = H('tr', { class: 'row', tabindex: k === 0 ? '0' : '-1', dataset: { sym: sym }, 'aria-label': sym },
          H('td', { class: 'sym trunc', 'data-tip': q ? q.name : sym, 'data-src': 'Source: ' + app().quotesSource }, sym), H('td', { class: 'spark c-spark' }), H('td', { class: 'num' }), H('td', { class: 'num' }));
        rows.set(sym, tr);
        return tr;
      }));
      update([]);
    }
    function update(changed) {
      const flashes = new Map(changed.map((c) => [c.sym, c.dir]));
      rows.forEach((tr, sym) => {
        const q = app().quotes.get(sym);
        const [, sp, last, chg] = tr.children;
        if (!q) { TT.setText(last, '\u2014'); TT.setText(chg, '\u2014'); tr.setAttribute('aria-label', sym + ', no quote from the feed'); tr.children[0].dataset.tip = sym + ' · no quote from the feed'; return; }
        tr.children[0].dataset.tip = q.name;
        const lastTxt = q.kind === 'yield' ? F.price(q.px, 'yield') + '%' : F.price(q.px, q.kind);
        TT.setText(last, lastTxt);
        TT.chgCell(chg, q);
        if (q.spark && (flashes.has(sym) || !sp.firstChild)) sp.replaceChildren(TT.sparkNode(q.spark, 60, 20));
        if (flashes.has(sym)) { TT.ui.flash(last, flashes.get(sym)); TT.ui.flash(chg, flashes.get(sym)); }
        tr.classList.toggle('ctx', app().isPinned('symbol', sym));
        tr.setAttribute('aria-selected', app().isPinned('symbol', sym) ? 'true' : 'false');
        tr.setAttribute('aria-label', sym + ' ' + lastTxt + ' ' + F.chg(q) + (app().isPinned('symbol', sym) ? ', in agent context' : ''));
      });
    }
    const togglePin = (tr) => { const sym = tr.dataset.sym; const q = app().quotes.get(sym); app().togglePin({ kind: 'symbol', id: sym, label: sym }); TT.ui.toast((app().isPinned('symbol', sym) ? 'Pinned ' : 'Unpinned ') + sym + (app().isPinned('symbol', sym) ? ' to agent context.' : ' from agent context.')); update([]); if (q) { /* noop */ } };
    tbody.addEventListener('click', (e) => { const tr = e.target.closest('tr.row'); if (tr) togglePin(tr); });
    TT.ui.roving(tbody, 'tr.row', { onEnter: togglePin, onKey: (e, tr) => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); app().toggleWatch(tr.dataset.sym, false); } } });
    TT.bus.on('quotes', (e) => { if (Date.now() < skelUntil && !rows.size) { setTimeout(() => { build(); }, skelUntil - Date.now()); return; } build(); update(e.changed); p.sub(app().quotesSource + ' · 1s · ' + F.utc(app().quotesAsOf)); });
    TT.bus.on('watch', () => { built = null; build(); });
    TT.bus.on('pins', () => update([]));
    new ResizeObserver(() => { p.el.classList.toggle('narrow', p.el.clientWidth < 280); TT.$$('.c-spark', p.el).forEach((c) => { c.style.display = p.el.clientWidth < 280 ? 'none' : ''; }); }).observe(p.el);

    // wire
    const tagSel = H('div', { class: 'seg-ctl', role: 'group', 'aria-label': 'Filter wire by tag' }, ['all', 'macro', 'geo', 'alert'].map((t) => H('button', { type: 'button', dataset: { tag: t }, 'aria-pressed': app().prefs.wireTag === t ? 'true' : 'false', onclick: () => { app().setPref('wireTag', t); renderWire(); } }, t.toUpperCase())));
    const symSel = H('select', { id: 'wire-sym', 'aria-label': 'Filter wire by symbol' });
    symSel.addEventListener('change', () => { app().setPref('wireSym', symSel.value); renderWire(); });
    const wireSub = H('span', { class: 'ps', text: 'wire' });
    const wireHead = H('div', { class: 'sh' }, H('h3', { class: 'pt', style: { margin: 0 } }, 'WIRE'), wireSub);
    const filters = H('div', { class: 'toolbar', style: { padding: '4px 10px' } }, tagSel, symSel);
    const list = H('ul', { class: 'list', 'aria-label': 'Wire' });
    const wireWrap = H('div', { style: { flex: '2 1 0', overflowY: 'auto', minHeight: '0' } }, list);
    const open = new Set();
    function renderWire(fresh) {
      const tag = app().prefs.wireTag, sym = app().prefs.wireSym;
      TT.$$('button', tagSel).forEach((b) => b.setAttribute('aria-pressed', b.dataset.tag === tag ? 'true' : 'false'));
      const syms = Array.from(new Set(app().wire.flatMap((w) => w.syms || []))).sort();
      const opts = ['all'].concat(syms);
      if (symSel.options.length !== opts.length) symSel.replaceChildren.apply(symSel, opts.map((s) => H('option', { value: s }, s === 'all' ? 'ALL SYMBOLS' : s)));
      symSel.value = opts.indexOf(sym) >= 0 ? sym : 'all';
      const items = app().wire.filter((w) => (tag === 'all' || w.tag === tag) && (sym === 'all' || (w.syms || []).indexOf(sym) >= 0));
      const wireDown = !!app().down.wire;
      TT.setText(wireSub, (app().wireSource || 'wire') + ' · 5s · ' + (app().wireAsOf ? F.utc(app().wireAsOf) : '—') + (wireDown ? ' · STALE' : ''));
      wireSub.classList.toggle('down', wireDown);
      if (!items.length) { list.replaceChildren(H('li', { class: 'empty' }, app().wire.length ? 'No wire items match these filters.' : wireDown ? 'Wire unavailable. Retrying.' : 'Waiting for the wire.')); return; }
      list.replaceChildren.apply(list, items.map((w) => wireItem(w, open, fresh && fresh.indexOf(w.id) >= 0, () => renderWire())));
    }
    TT.bus.on('wire', (e) => renderWire(e.fresh));
    TT.bus.on('health', (name) => { if (name === 'wire') renderWire(); });
    p.body.append(wrap, wireHead, filters, wireWrap);
    return { panel: p, refresh: () => { build(); update([]); renderWire(); } };
  }

  function wireItem(w, open, isNew, rerender) {
    const isOpen = open.has(w.id);
    const btn = H('button', { type: 'button', 'aria-expanded': isOpen ? 'true' : 'false' }, H('span', { class: 't' }, F.utc(w.ts, false)), H('span', { class: 'tag ' + w.tag }, w.tag), H('span', { class: 'trunc', 'data-src': 'Source: ' + w.src }, w.head));
    btn.addEventListener('click', () => { if (open.has(w.id)) open.delete(w.id); else open.add(w.id); rerender(); });
    const kids = [btn];
    if (isOpen) {
      const acts = [];
      const srcRoute = w.site ? 'orbital/' + w.site : 'macro';
      const safeUrl = typeof w.url === 'string' && /^https?:\/\//i.test(w.url.trim()) ? w.url.trim() : null; // only web links from the feed
      if (safeUrl) acts.push(H('a', { href: safeUrl, target: '_blank', rel: 'noopener noreferrer' }, 'SOURCE · ' + w.src + ' ↗'));
      else acts.push(H('button', { class: 'src info', type: 'button', onclick: () => TT.router.go(srcRoute) }, 'SOURCE · ' + w.src));
      if (w.site) acts.push(H('button', { class: 'geo', type: 'button', onclick: () => TT.router.go('orbital/' + w.site) }, 'OPEN IN ORBITAL →'));
      (w.syms || []).forEach((s) => acts.push(H('button', { class: 'amber', type: 'button', onclick: () => { app().setPref('wireSym', s); rerender(); } }, s)));
      kids.push(H('div', { class: 'wire-more' }, H('div', null, w.sum), H('div', { class: 'acts' }, acts)));
    }
    return H('li', { class: 'wire-item' + (isNew ? ' new' : '') }, kids);
  }
  TT.wireItem = wireItem;

  /* ---------- panel: macro + orbital ---------- */
  function macroPanel() {
    const p = TT.ui.panel({ id: 'macro', title: 'MACRO', sub: 'feed · session change', noscroll: true, actions: [H('button', { class: 'btn btn-ghost', type: 'button', onclick: () => TT.router.go('macro'), 'data-tip': 'Open the macro dashboard  F1' }, 'F1')] });
    const cards = KPI.map(([slot, sym]) => { const c = TT.kpiCard(slot, sym); c.addEventListener('click', () => TT.router.go('macro')); return c; });
    const strip = H('div', { class: 'kpis' }, cards);
    const viewer = new TT.Orbital({ compact: true });
    const orbSub = H('span', { class: 'ps', text: 'segmentation' });
    const head = H('div', { class: 'sh' }, H('h3', { class: 'pt', style: { margin: 0 } }, 'ORBITAL'), orbSub, H('div', { class: 'pa' }, H('button', { class: 'btn btn-ghost', type: 'button', onclick: () => TT.router.go(viewer.site ? 'orbital/' + viewer.site : 'orbital'), 'data-tip': 'Open full orbital view  F2' }, 'F2')));
    const ctl = viewer.controls(false);
    p.body.append(strip, head, ctl, viewer.el);
    viewer.on((v) => { if (v.res) TT.setText(orbSub, v.res.pass.model.split(' · ')[0] + ' segmentation · ' + F.num(v.res.pass.gsd, 2) + ' m · pass ' + F.utc(v.res.pass.ts, false)); });
    function update() {
      cards.forEach((c, k) => { const q = app().quotes.get(KPI[k][1]); if (q) c.set(q.px, q.kind, q.chg, q.chgPct); });
      p.sub(app().quotesSource + ' · session change · ' + F.utc(app().quotesAsOf));
    }
    TT.bus.on('quotes', update);
    return { panel: p, viewer: viewer, refresh: update };
  }

  /* ---------- panel: agent ---------- */
  function agentPanel() {
    const p = TT.ui.panel({ id: 'agent', title: 'AGENT', sub: TT.labels.agentModel(), noscroll: true, actions: [H('button', { class: 'btn btn-ghost', type: 'button', onclick: () => TT.router.go('agent'), 'data-tip': 'Open full agent view  F3' }, 'F3')] });
    const a = new TT.AgentPanel({});
    p.body.append(a.el);
    const sub = () => { const s = app().system; const w = TT.labels.agentWhere(); p.sub([TT.labels.agentModel(), w, s && s.context ? 'ctx ' + F.tokens(s.context.used) + ' / ' + F.tokens(s.context.max) : ''].filter(Boolean).join(' · ')); };
    TT.bus.on('system', sub);
    return { panel: p, agent: a, refresh: sub };
  }

  /* ---------- panel: capital flow ---------- */
  TT.flowModeCtl = function () {
    const ctl = H('div', { class: 'seg-ctl', role: 'group', 'aria-label': 'Flow display' }, [['abs', 'ABS'], ['share', 'SHARE']].map(([m, l]) => H('button', { type: 'button', dataset: { mode: m }, 'aria-pressed': app().prefs.flowMode === m ? 'true' : 'false', onclick: () => app().setPref('flowMode', m) }, l)));
    TT.bus.on('prefs', (e) => { if (e.key === 'flowMode') TT.$$('button', ctl).forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === e.value ? 'true' : 'false')); });
    return ctl;
  };
  function flowPanel() {
    const p = TT.ui.panel({ id: 'flow', title: 'CAPITAL FLOW', sub: 'USD mm · 72h', noscroll: true, actions: [TT.flowModeCtl()] });
    const host = H('div', { class: 'chart', role: 'img', 'aria-label': 'Capital flow by asset class, last 72 hours' });
    p.body.append(host);
    const chart = new TT.StackChart(host);
    function update() {
      const f = app().flow; if (!f) return;
      chart.setData({ t: f.t, categories: f.categories, series: f.series, unit: f.unit, mode: app().prefs.flowMode });
      p.sub(f.unit + ' · 72h · ' + f.source);
    }
    TT.bus.on('flow', update);
    TT.bus.on('prefs', (e) => { if (e.key === 'flowMode') { if (chart.data) { chart.data.mode = e.value; chart.render(); } } });
    return { panel: p, chart: chart, refresh: update };
  }

  /* ---------- panel: event timeline ---------- */
  TT.timelineList = function (limit) {
    const list = H('ul', { class: 'list', 'aria-label': 'Event timeline' });
    const tagFor = (t) => (t.type === 'alert' ? [t.sev === 'high' ? 'alert' : 'sev-' + (t.sev || 'med'), t.sev === 'high' ? 'ALERT' : (t.sev || 'med').toUpperCase()] : t.type === 'pass' ? ['geo', 'PASS'] : t.type === 'macro' ? ['macro', 'MACRO'] : t.type === 'ack' ? ['info', 'ACK'] : t.type === 'agent' ? ['info', 'AGENT'] : ['info', 'SYSTEM']);
    function render() {
      const items = app().timeline.slice(0, limit || 80);
      if (!items.length) { list.replaceChildren(H('li', { class: 'empty' }, 'No events yet.')); return; }
      list.replaceChildren.apply(list, items.map((t) => {
        const [cls, label] = tagFor(t);
        return H('li', { class: 'tl-item' }, H('span', { class: 't' }, F.utc(t.ts)), H('span', { class: 'tag ' + cls }, label),
          t.route ? H('button', { class: 'trunc', type: 'button', onclick: () => TT.router.go(t.route) }, t.text) : H('span', { class: 'trunc' }, t.text));
      }));
    }
    TT.bus.on('timeline', render);
    render();
    return { el: list, render: render };
  };
  function timelinePanel() {
    const p = TT.ui.panel({ id: 'timeline', title: 'EVENT TIMELINE', sub: 'alerts · passes · macro · agent' });
    const tl = TT.timelineList(80);
    p.body.append(tl.el);
    TT.bus.on('timeline', () => p.sub(app().timeline.length + ' events · latest ' + (app().timeline[0] ? F.utc(app().timeline[0].ts) : '—')));
    return { panel: p, refresh: tl.render };
  }

  /* ---------- panel: system ---------- */
  TT.systemBody = function () {
    const models = H('div', { class: 'sys-models' });
    const bar = H('div', { class: 'ctxbar-big', role: 'meter', 'aria-label': 'Context usage', 'aria-valuemin': '0', 'aria-valuemax': '1000000' }, H('i', { style: { width: '0%' } }));
    const ctxTxt = H('b', { text: '\u2014' });
    const fused = H('b', { text: '\u2014' });
    const mode = H('b', { text: '\u2014' });
    const feed = H('b', { text: '\u2014' });
    const kv = (k, v) => H('div', null, H('span', { class: 'k' }, k), v);
    const hint = H('div', { class: 'hint trunc', hidden: true, 'data-tip': 'Scaffold mode: synthetic data. Define window.TERRATERM.api (watchlist, macro, imagery, ask) before the app script to go live. See CONTRACT.md.' }, 'Wire a backend: define ', H('code', null, 'window.TERRATERM.api'), ' before the app script.');
    const fb = H('div', { class: 'hint trunc', hidden: true });
    const el = H('div', { class: 'sys' },
      models,
      H('div', { class: 'sys-ctx' }, H('div', { class: 'sys-row' }, H('span', { class: 'k' }, 'Context'), ctxTxt), bar),
      H('div', { class: 'sys-kv' }, kv('Sources fused', fused), kv('Feed', feed), kv('Backend', mode)),
      hint, fb);
    function render() {
      const s = app().system;
      if (s) {
        models.replaceChildren.apply(models, s.models.map((m) => H('div', { class: 'sys-model' }, H('span', { class: 'dot ' + (m.status === 'ok' ? 'st-ok' : m.status === 'degraded' ? 'st-warn' : 'st-down') }), H('span', { class: 'trunc' }, H('b', null, m.name), ' ', H('span', { class: 'role' }, m.role)), H('span', { class: 'muted' }, m.where), H('span', { class: 'num' }, m.status === 'ok' ? (Number.isFinite(m.latencyMs) ? m.latencyMs + ' ms' : 'OK') : String(m.status || 'unknown').toUpperCase()))));
        if (s.context) {
          const pct = s.context.used / s.context.max;
          bar.className = 'ctxbar-big' + (pct > 0.9 ? ' crit' : pct > 0.7 ? ' warn' : '');
          bar.firstChild.style.width = (pct * 100).toFixed(1) + '%';
          bar.setAttribute('aria-valuemax', String(s.context.max));
          bar.setAttribute('aria-valuenow', String(s.context.used));
          bar.setAttribute('aria-valuetext', F.tokens(s.context.used) + ' of ' + F.tokens(s.context.max));
          TT.setText(ctxTxt, F.tokens(s.context.used) + ' / ' + F.tokens(s.context.max) + ' \u00b7 ' + Math.round(pct * 100) + '%');
        } else {
          bar.className = 'ctxbar-big'; bar.firstChild.style.width = '0%';
          bar.setAttribute('aria-valuenow', '0'); bar.setAttribute('aria-valuetext', 'Not reported');
          TT.setText(ctxTxt, '\u2014');
        }
        TT.setText(fused, s.sourcesFused != null ? String(s.sourcesFused) : '\u2014');
      }
      TT.setText(mode, app().mode.toUpperCase());
      mode.className = app().mode === 'scaffold' ? 'amber' : '';
      hint.hidden = app().mode !== 'scaffold';
      fb.hidden = !app().fallbacks.length;
      fb.textContent = 'Not connected (backend has no method): ' + app().fallbacks.join(', ') + '.';
      fb.dataset.tip = fb.textContent;
      const live = app().feed.status === 'live';
      TT.setText(feed, live ? 'LIVE' : 'DOWN');
      feed.className = live ? '' : 'down';
      feed.dataset.tip = live ? 'Last update ' + F.utc(app().feed.lastOk || Date.now()) : (app().feed.error || 'Retrying');
    }
    TT.bus.on('system', render);
    TT.bus.on('feed', render);
    render();
    return { el: el, render: render };
  };
  function systemPanel() {
    const p = TT.ui.panel({ id: 'system', title: 'SYSTEM', sub: 'models · context · backend' });
    const s = TT.systemBody();
    p.body.append(s.el);
    TT.bus.on('system', () => p.sub('health · 3s · ' + F.utc(app().systemAsOf)));
    return { panel: p, refresh: s.render };
  }

  /* ---------- layout: resize + reorder ---------- */
  function layout(desk, panels) {
    const L = Object.assign({ colL: 300, colR: 340, rowB: 220, order: ORDER.slice() }, app().prefs.layout || {});
    if (!Array.isArray(L.order) || L.order.length !== 6 || ORDER.some((id) => L.order.indexOf(id) < 0)) L.order = ORDER.slice();
    const apply = () => {
      desk.style.setProperty('--col-l', L.colL + 'px'); desk.style.setProperty('--col-r', L.colR + 'px'); desk.style.setProperty('--row-b', L.rowB + 'px');
      L.order.forEach((id, k) => { const el = panels[id].el; el.style.setProperty('--slot', k); el.dataset.slot = String(k); });
      [c1, c2, rr].forEach((h) => h.setAttribute('aria-valuenow', String(h === c1 ? L.colL : h === c2 ? L.colR : L.rowB)));
    };
    const save = () => app().setPref('layout', { colL: L.colL, colR: L.colR, rowB: L.rowB, order: L.order.slice() });
    const mk = (cls, label, key, min, max) => {
      const h = H('div', { class: 'rz ' + cls, role: 'separator', tabindex: '0', 'aria-label': label, 'aria-orientation': key === 'rowB' ? 'horizontal' : 'vertical', 'aria-valuemin': String(min), 'aria-valuemax': String(max), 'data-tip': label + ' · drag or use arrow keys' });
      h.addEventListener('pointerdown', (e) => {
        e.preventDefault(); h.setPointerCapture(e.pointerId); h.classList.add('dragging');
        const move = (ev) => {
          const r = desk.getBoundingClientRect();
          let v = key === 'colL' ? ev.clientX - r.left : key === 'colR' ? r.right - ev.clientX : r.bottom - ev.clientY;
          L[key] = Math.round(TT.clamp(v, min, Math.min(max, (key === 'rowB' ? r.height - 200 : r.width - (key === 'colL' ? L.colR : L.colL) - 320))));
          apply();
        };
        const up = () => { h.classList.remove('dragging'); h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); save(); };
        h.addEventListener('pointermove', move); h.addEventListener('pointerup', up);
      });
      h.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 48 : 16;
        let d = 0;
        if (key === 'rowB') { if (e.key === 'ArrowUp') d = step; if (e.key === 'ArrowDown') d = -step; }
        else if (key === 'colL') { if (e.key === 'ArrowRight') d = step; if (e.key === 'ArrowLeft') d = -step; }
        else { if (e.key === 'ArrowLeft') d = step; if (e.key === 'ArrowRight') d = -step; }
        if (d) { e.preventDefault(); const r = desk.getBoundingClientRect(); L[key] = Math.round(TT.clamp(L[key] + d, min, Math.max(min, Math.min(max, key === 'rowB' ? r.height - 200 : r.width - (key === 'colL' ? L.colR : L.colL) - 320)))); apply(); save(); }
      });
      return h;
    };
    const c1 = mk('rz-c1', 'Resize left column', 'colL', 220, 520);
    const c2 = mk('rz-c2', 'Resize right column', 'colR', 260, 560);
    const rr = mk('rz-r', 'Resize bottom row', 'rowB', 140, 460);
    desk.append(c1, c2, rr);
    let dragId = null;
    ORDER.forEach((id) => {
      const el = panels[id].el, head = panels[id].head;
      head.setAttribute('draggable', 'true');
      head.setAttribute('data-tip', 'Drag to reorder panels · Alt+Shift+Arrows');
      head.addEventListener('dragstart', (e) => { dragId = id; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id); } catch (err) { /* noop */ } });
      head.addEventListener('dragend', () => { dragId = null; el.classList.remove('dragging'); TT.$$('.drop-target', desk).forEach((x) => x.classList.remove('drop-target')); });
      el.addEventListener('dragover', (e) => { if (dragId && dragId !== id) { e.preventDefault(); el.classList.add('drop-target'); } });
      el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
      el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('drop-target'); if (dragId && dragId !== id) swap(dragId, id); });
    });
    function swap(a, b) {
      const i = L.order.indexOf(a), j = L.order.indexOf(b);
      L.order[i] = b; L.order[j] = a;
      apply(); save();
      TT.ui.toast('Layout saved.');
    }
    apply();
    return {
      move(id, dir) {
        const i = L.order.indexOf(id);
        const col = i % 3, row = Math.floor(i / 3);
        let j = -1;
        if (dir === 'ArrowLeft' && col > 0) j = i - 1;
        if (dir === 'ArrowRight' && col < 2) j = i + 1;
        if (dir === 'ArrowUp' && row > 0) j = i - 3;
        if (dir === 'ArrowDown' && row < 1) j = i + 3;
        if (j >= 0) { swap(id, L.order[j]); panels[id].el.focus(); }
      },
      reset() { L.colL = 300; L.colR = 340; L.rowB = 220; L.order = ORDER.slice(); apply(); save(); TT.ui.toast('Layout reset.'); },
    };
  }

  /* ---------- view ---------- */
  TT.views = TT.views || {};
  TT.views.desk = {
    title: 'DESK',
    mount(el) {
      const parts = { watch: watchPanel(), macro: macroPanel(), agent: agentPanel(), flow: flowPanel(), timeline: timelinePanel(), system: systemPanel() };
      this.parts = parts;
      const panels = {};
      ORDER.forEach((id) => { panels[id] = { el: parts[id].panel.el, head: parts[id].panel.head }; });
      const desk = H('div', { class: 'desk', role: 'region', 'aria-label': 'Desk' }, ORDER.map((id) => panels[id].el));
      el.append(desk);
      this.layout = layout(desk, panels);
      this.viewer = parts.macro.viewer;
      this.agent = parts.agent.agent;
      const firstSite = () => app().orbitalSite || (app().sites[0] && app().sites[0].id);
      if (firstSite()) this.viewer.load(firstSite());
      else {
        this.viewer.showMessage('No site selected. Set TERRATERM.config.defaultSite or provide sites().');
        const off = TT.bus.on('sites', () => { if (!this.viewer.site && firstSite()) { off(); this.viewer.load(firstSite()); } });
      }
      Object.values(parts).forEach((p) => p.refresh && p.refresh());
      const staleAll = () => {
        const down = app().feed.status === 'down';
        parts.watch.panel.stale(down || app().isStale(app().quotesAsOf) ? (app().feed.lastOk || app().quotesAsOf) : null);
        parts.watch.panel.error(down ? 'Feed disconnected. Retrying.' : null, () => app().retryFeed());
        parts.macro.panel.stale(down || app().isStale(app().quotesAsOf) ? (app().feed.lastOk || app().quotesAsOf) : null);
        const opt = (name) => (app().down[name] ? app().lastOk(name) : null);
        parts.flow.panel.stale(down || app().isStale(app().flowAsOf) ? (app().flowAsOf || app().feed.lastOk) : opt('flow'));
        parts.timeline.panel.stale(opt('events'));
        parts.system.panel.stale(opt('system'));
      };
      TT.bus.on('feed', staleAll);
      TT.bus.on('health', staleAll);
      TT.bus.on('tick', () => { if (app().quotesAsOf) staleAll(); });
    },
    show() { if (this.viewer && this.viewer.res) this.viewer.draw(); },
    hide() { if (this.viewer) this.viewer.stop(); },
    handleKey(e) {
      if (e.altKey && e.shiftKey && /^Arrow/.test(e.key)) {
        const panel = document.activeElement && document.activeElement.closest('.desk > .panel');
        if (panel) { e.preventDefault(); this.layout.move(panel.dataset.panel, e.key); return true; }
      }
      if (this.viewer && !e.altKey && !e.ctrlKey && !e.metaKey && this.viewer.handleKey(e)) return true;
      return false;
    },
    focusAgent() { this.agent.focus(); },
  };
})();
