/* Full views: F1 Macro, F2 Orbital, F3 Agent, F4 Flow, F5 Commodities, F6 FX, F7 Satellite intel, F8 Alerts. */
(function () {
  'use strict';
  const TT = window.TT;
  const H = TT.h;
  const F = TT.fmt;
  const app = () => TT.app;
  TT.views = TT.views || {};

  function frame(title, extras) {
    const sub = H('span', { class: 'ps', text: '' });
    const head = H('header', { class: 'fv-head' }, H('h1', null, title), sub, extras || null);
    const body = H('div', { class: 'fv-body' });
    const el = H('div', { class: 'fv' }, head, body);
    return { el: el, head: head, body: body, sub: (t) => { TT.setText(sub, t); sub.dataset.tip = t; } };
  }
  function visibleView(name) { return TT.router && TT.router.current.view === name; }

  /* ===================== F1 Macro ===================== */
  TT.views.macro = {
    title: 'MACRO',
    mount(el) {
      const tfCtl = H('div', { class: 'seg-ctl', role: 'group', 'aria-label': 'Timeframe' }, ['1D', '1W', '1M', '1Y'].map((tf) => H('button', { type: 'button', dataset: { tf: tf }, 'aria-pressed': app().prefs.tf === tf ? 'true' : 'false', onclick: () => this.setTf(tf) }, tf)));
      const overlay = H('button', { class: 'btn', type: 'button', 'aria-pressed': app().prefs.overlay === false ? 'false' : 'true', 'data-tip': 'Markers where imagery events coincide with price moves', onclick: () => { app().setPref('overlay', overlay.getAttribute('aria-pressed') !== 'true'); overlay.setAttribute('aria-pressed', app().prefs.overlay ? 'true' : 'false'); this.render(); } }, 'PHYSICAL SIGNALS');
      const f = frame('MACRO DASHBOARD', H('div', { class: 'pa' }, tfCtl, overlay));
      this.f = f; this.tfCtl = tfCtl;
      this.cards = TT.KPI.map(([slot, sym]) => { const c = TT.kpiCard(slot, sym, { src: 'macro feed' }); c.addEventListener('click', () => this.toggleSeries(sym)); return c; });
      const grid = H('div', { class: 'kpi-grid' }, this.cards);
      this.legend = H('div', { class: 'legend-row', role: 'group', 'aria-label': 'Series' });
      const host = H('div', { class: 'chart', role: 'img', 'aria-label': 'Cross-asset chart, rebased to 100 at the start of the window' });
      this.chartAlt = H('div', { class: 'sr-only chart-alt', 'aria-label': 'Chart data in text form' });
      this.src = H('div', { class: 'chart-src' });
      this.chartWrap = H('div', { style: { flex: '1', minHeight: '0', display: 'flex', flexDirection: 'column', position: 'relative' } }, host, this.chartAlt);
      f.body.append(H('div', { class: 'fv-pad', style: { display: 'grid', gap: '10px', flex: 'none' } }, grid, this.legend), this.chartWrap, this.src);
      el.append(f.el);
      this.chart = new TT.LineChart(host, { endLabels: true, yFmt: (v) => F.num(v, 1), onMarker: (m, pos) => this.marker(m, pos) });
      // Track the timeframe we asked for, not the one echoed back: a backend that omits or misspells `tf`
      // must not trigger an immediate refetch loop. A stale answer (the user switched mid-request) is dropped
      // and refetched once, because the requested timeframe then differs from the current one.
      this.poll = new TT.ui.Poller('macro', () => { const tf = app().prefs.tf; return Promise.resolve(app().api.macro({ tf: tf })).then((r) => ({ r: r, tf: tf })); }, 5000, {
        onData: (d) => {
          if (d.tf !== app().prefs.tf) { this.poll.now(); return; }
          const r = d.r || {};
          if (r.tf == null) r.tf = d.tf;
          this.res = r; this.render();
        },
        onError: () => this.render(),
      });
    },
    setTf(tf) {
      app().setPref('tf', tf);
      TT.$$('button', this.tfCtl).forEach((b) => b.setAttribute('aria-pressed', b.dataset.tf === tf ? 'true' : 'false'));
      this.poll.now();
    },
    toggleSeries(sym) {
      const all = TT.KPI.map((k) => k[1]);
      let vis = app().prefs.series || all.slice();
      vis = vis.indexOf(sym) >= 0 ? vis.filter((s) => s !== sym) : vis.concat([sym]);
      if (!vis.length) vis = all.slice();
      app().setPref('series', vis);
      this.render();
    },
    render() {
      const r = this.res;
      if (!r) return;
      const P = TT.chartPalette();
      const vis = app().prefs.series || TT.KPI.map((k) => k[1]);
      const bySym = new Map((r.kpis || []).map((kp) => [kp.sym, kp]));
      this.cards.forEach((c, k) => {
        const sym = TT.KPI[k][1], kp = bySym.get(sym);
        if (kp) c.set(kp.value, kp.kind, kp.chg, kp.chgPct, r.tf); else c.set(null);
        c.setAttribute('aria-pressed', vis.indexOf(sym) >= 0 ? 'true' : 'false');
        c.style.opacity = vis.indexOf(sym) >= 0 ? '1' : '0.5';
      });
      const rs = Array.isArray(r.series) ? r.series : [];
      this.legend.replaceChildren.apply(this.legend, rs.map((s, k) => H('button', { class: 'chip', type: 'button', 'aria-pressed': vis.indexOf(s.id) >= 0 ? 'true' : 'false', onclick: () => this.toggleSeries(s.id) }, H('i', { class: 'sw', style: { color: P.series[k % P.series.length] } }), s.id + ' · ' + s.name)));
      const series = rs.map((s, k) => ({ id: s.id, label: s.id, kind: s.kind, points: s.points || [], color: P.series[k % P.series.length], visible: vis.indexOf(s.id) >= 0 }));
      // Only count and draw signals that fall inside the plotted window, so the subtitle matches the chart.
      let w0 = Infinity, w1 = -Infinity;
      series.forEach((s) => { if (s.visible && s.points.length) { w0 = Math.min(w0, s.points[0][0]); w1 = Math.max(w1, s.points[s.points.length - 1][0]); } });
      const markers = app().prefs.overlay === false ? [] : (Array.isArray(r.signals) ? r.signals : []).filter((m) => vis.indexOf(m.sym) >= 0 && m.t >= w0 && m.t <= w1);
      this.chart.setData({ series: series, rebase: true, yLabel: 'REBASED (START = 100)', xLabel: 'TIME (UTC) · ' + r.tf, markers: markers });
      this.chartAlt.replaceChildren(H('ul', null,
        series.filter((s) => s.visible).map((s) => { const last = s.points[s.points.length - 1]; return H('li', null, s.id + ' ' + (s.label || '') + ': ' + (last ? F.num(last[1], 2) + ' at ' + F.utcDate(last[0]) : 'no data')); }),
        markers.map((m) => H('li', null, 'Physical signal: ' + m.label + ' on ' + m.sym + ' at ' + F.utcDate(m.t)))));
      const down = app().feed.status === 'down';
      TT.setText(this.src, 'Source: ' + r.source + ' · ' + r.tf + ' window · rebased to 100 at window start · physical markers from satellite passes' + (TT.labels.segModel() ? ' (' + TT.labels.segModel() + ')' : '') + ' · as of ' + F.utc(r.asOf) + (down ? ' · STALE' : ''));
      this.f.sub(r.source + ' · ' + r.tf + ' · ' + markers.length + ' physical signals · ' + F.utc(r.asOf));
    },
    marker(m, pos) {
      const content = H('div', { style: { display: 'grid', gap: '8px' } },
        H('h4', null, m.label),
        H('div', { class: 'muted' }, 'Pass ' + F.utcDate(m.t) + ' · linked ' + m.sym + ' · confidence ' + TT.fmt.conf(m.conf)),
        H('div', { class: 'rule' }, H('b', null, 'DETECTION RULE  '), m.rule),
        H('table', { class: 'mini-tbl' }, H('thead', null, H('tr', null, H('th', null, 'Pass (UTC)'), H('th', { class: 'num' }, m.metric))), H('tbody', null, m.raw.map((p) => H('tr', null, H('td', null, F.utcDate(p.t)), H('td', { class: 'num' }, typeof p.v === 'number' ? F.num(p.v, Math.abs(p.v) < 10 ? 2 : 1) + (m.unit || '') : p.v))))),
        H('button', { class: 'btn btn-amber', type: 'button', onclick: () => { TT.ui.closeTop(); TT.router.go('orbital/' + m.site + '/' + m.segId); } }, 'OPEN IN ORBITAL'));
      TT.ui.popover(this.chartWrap, pos.x, pos.y, content);
    },
    show() { this.poll.start(); this.poll.now(); },
    hide() { this.poll.stop(); },
  };

  /* ===================== F2 Orbital ===================== */
  TT.views.orbital = {
    title: 'ORBITAL',
    mount(el) {
      const f = frame('ORBITAL INTELLIGENCE');
      this.f = f;
      const v = (this.viewer = new TT.Orbital({ compact: false }));
      const ctl = v.controls(true);
      this.film = H('div', { class: 'film', role: 'listbox', 'aria-label': 'Recent passes' });
      this.tbody = H('tbody');
      const seglist = H('table', { class: 'tbl', 'aria-label': 'Segments on this pass (text alternative to the imagery)' },
        H('colgroup', null, H('col', { style: { width: '102px' } }), H('col'), H('col', { style: { width: '50px' } }), H('col', { style: { width: '124px' } }), H('col', { style: { width: '74px' } })),
        H('thead', null, H('tr', null, H('th', null, 'CLASS'), H('th', null, 'SEGMENT'), H('th', { class: 'num' }, 'CONF'), H('th', { class: 'num' }, 'METRIC'), H('th', { class: 'num' }, 'Δ PRIOR'))), this.tbody);
      this.segCount = H('span', { class: 'ps' });
      const left = H('div', { class: 'orb-left' }, v.el, H('div', { class: 'film-wrap' }, TT.ui.section('PASSES', 'last 6 · click, [ ] or P to loop'), this.film));
      const right = H('div', { class: 'orb-right' }, H('div', { class: 'sh', style: { borderTop: '0' } }, H('h3', { class: 'pt', style: { margin: 0 } }, 'SEGMENTS'), this.segCount), H('div', { class: 'seglist-wrap' }, seglist));
      f.body.append(ctl, H('div', { class: 'orb-full' }, left, right));
      el.append(f.el);
      TT.ui.roving(this.tbody, 'tr.row', { onEnter: (tr) => v.select(tr.dataset.seg) });
      this.tbody.addEventListener('click', (e) => { const tr = e.target.closest('tr.row'); if (tr) v.select(tr.dataset.seg); });
      v.on(() => this.sync());
      TT.bus.on('prefs', (e) => { if (e.key === 'minConf') this.sync(); });
    },
    async show(params) {
      const site = params[0] || app().orbitalSite || (app().sites[0] && app().sites[0].id);
      const seg = params[1];
      if (!site) { this.viewer.showMessage('No site selected. Set TERRATERM.config.defaultSite or provide sites().'); return; }
      if (site !== this.viewer.site || !this.viewer.res) await this.viewer.load(site);
      else this.viewer.draw();
      if (seg && this.viewer.seg(seg)) this.viewer.select(seg);
      this.renderFilm();
    },
    hide() { this.viewer.stop(); },
    handleKey(e) { return !e.altKey && !e.ctrlKey && !e.metaKey && this.viewer.handleKey(e); },
    sync() {
      const v = this.viewer;
      if (!v.res) return;
      const min = app().prefs.minConf;
      const vis = v.visible();
      this.f.sub(v.res.site.name + ' · ' + v.res.site.type + ' · ' + v.res.site.region + ' · ' + v.res.pass.sensor + ' ' + F.num(v.res.pass.gsd, 2) + ' m · ' + v.res.pass.model);
      TT.setText(this.segCount, vis.length + ' shown of ' + v.segments.length + ' · min conf ' + min.toFixed(2) + (v.iso ? ' · ' + v.iso + ' only' : ''));
      const focusedId = document.activeElement && document.activeElement.closest('tr.row') && this.tbody.contains(document.activeElement) ? document.activeElement.dataset.seg : null;
      this.tbody.replaceChildren.apply(this.tbody, vis.slice().sort((a, b) => (b.hud - a.hud) || a.label.localeCompare(b.label)).map((s, k) => H('tr', { class: 'row' + (s.id === v.sel ? ' sel' : ''), tabindex: (focusedId ? s.id === focusedId : k === 0) ? '0' : '-1', dataset: { seg: s.id } },
        H('td', null, H('span', { class: 'tag cls-' + s.cls }, s.cls)), H('td', { class: 'trunc' }, s.label), H('td', { class: 'num' }, TT.fmt.conf(s.conf)), H('td', { class: 'num trunc' }, s.metric.name + ' ' + TT.metricText(s.metric)), H('td', { class: 'num' }, TT.metricDelta(s.metric)))));
      if (focusedId) { const r = this.tbody.querySelector('[data-seg="' + focusedId + '"]'); if (r) r.focus(); }
      TT.$$('button', this.film).forEach((b) => b.setAttribute('aria-current', Number(b.dataset.i) === v.passIdx ? 'true' : 'false'));
      if (this.filmSite !== v.site) this.renderFilm();
    },
    async renderFilm() {
      const v = this.viewer;
      if (!v.res) return;
      const site = v.site;
      this.filmSite = site;
      const list = await app().allPasses(site, 6).catch(() => []);
      if (site !== v.site) return;
      this.film.replaceChildren.apply(this.film, list.map((r) => {
        const c = H('canvas', { width: 128, height: 80 });
        TT.Imagery.drawCrop(r.pass, c).catch(() => null);
        const b = H('button', { type: 'button', role: 'option', dataset: { i: String(r.pass.i) }, 'aria-current': r.pass.i === v.passIdx ? 'true' : 'false', 'aria-label': 'Pass ' + F.utcDate(r.pass.ts) }, c, H('span', null, F.utcDate(r.pass.ts).slice(5)));
        b.addEventListener('click', () => v.setPass(r.pass.i));
        return b;
      }));
    },
  };

  /* ===================== F3 Agent ===================== */
  TT.views.agent = {
    title: 'AGENT',
    mount(el) {
      const f = frame('AGENT');
      this.f = f;
      this.panel = new TT.AgentPanel({ full: true });
      const prompts = H('div', { style: { display: 'grid', gap: '6px' } });
      const renderPrompts = () => prompts.replaceChildren.apply(prompts, TT.labels.prompts().map((p) => H('button', { class: 'chip', type: 'button', style: { justifySelf: 'start' }, onclick: () => this.panel.send(p) }, p)));
      renderPrompts();
      TT.bus.on('mode', renderPrompts);
      this.ctx = H('div', { style: { display: 'grid', gap: '4px' } });
      this.sys = H('div', { class: 'muted', style: { display: 'grid', gap: '4px' } });
      const side = H('aside', { 'aria-label': 'Agent details' },
        H('div', { class: 'side-sec' }, H('h2', null, 'Suggested'), prompts),
        H('div', { class: 'side-sec' }, H('h2', null, 'Selected segment'), this.ctx),
        H('div', { class: 'side-sec' }, H('h2', null, 'Models'), this.sys),
        H('div', { class: 'side-sec' }, H('h2', null, 'How it answers'), H('div', { class: 'muted' }, 'Answer first, then the panels it used and a numeric confidence. When data is missing it says so and names the next check. It describes what the data shows and never phrases output as trade orders.')),
        H('div', { class: 'side-sec' }, H('button', { class: 'btn', type: 'button', onclick: () => { app().clearChat(); TT.ui.toast('Conversation cleared.'); } }, 'CLEAR CONVERSATION')));
      f.body.append(H('div', { class: 'agent-full' }, H('div', null, this.panel.el), side));
      el.append(f.el);
      const sync = () => {
        const s = app().system;
        if (s) { f.sub(s.models.map((m) => [m.name, m.where].filter(Boolean).join(' ')).concat(s.context ? ['ctx ' + F.tokens(s.context.used) + ' / ' + F.tokens(s.context.max)] : []).join(' · ')); this.sys.replaceChildren.apply(this.sys, s.models.map((m) => H('div', null, H('b', { style: { color: 'var(--text)' } }, m.name), ' · ' + [m.role, m.where, m.status === 'ok' ? (Number.isFinite(m.latencyMs) ? m.latencyMs + ' ms' : 'ok') : m.status].filter(Boolean).join(' · ')))); }
        const sel = app().selected;
        this.ctx.replaceChildren(sel ? H('div', null, H('span', { class: 'amber' }, sel.id.toUpperCase()), ' · ' + sel.site, H('div', null, H('button', { class: 'btn btn-ghost', type: 'button', onclick: () => TT.router.go('orbital/' + sel.site + '/' + sel.id) }, 'VIEW'), H('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { app().selected = null; sync(); } }, 'CLEAR'))) : H('span', { class: 'muted' }, 'None. Select a segment in Orbital to ask about it.'));
      };
      TT.bus.on('system', sync);
      this.sync = sync;
      sync();
    },
    show() { this.sync(); setTimeout(() => this.panel.focus(), 0); },
    focusAgent() { this.panel.focus(); },
  };

  /* ===================== F4 Flow ===================== */
  TT.views.flow = {
    title: 'FLOW',
    mount(el) {
      const f = frame('CAPITAL FLOW', H('div', { class: 'pa' }, TT.flowModeCtl()));
      this.f = f;
      const host = H('div', { class: 'chart', role: 'img', 'aria-label': 'Capital flow by asset class, last 72 hours. Summary table follows.' });
      this.chart = new TT.StackChart(host);
      this.tbody = H('tbody');
      const table = H('table', { class: 'tbl', 'aria-label': 'Flow summary' }, H('thead', null, H('tr', null, H('th', null, 'ASSET CLASS'), H('th', { class: 'num' }, 'LAST HOUR'), H('th', { class: 'num' }, '24H'), H('th', { class: 'num' }, '72H'), H('th', { class: 'num' }, 'SHARE 24H'))), this.tbody);
      this.src = H('div', { class: 'chart-src' });
      f.body.append(H('div', { style: { flex: '1', minHeight: '0', display: 'flex', flexDirection: 'column', padding: '8px 4px 0' } }, host), this.src, H('div', { style: { flex: 'none', maxHeight: '190px', overflow: 'auto' } }, table));
      el.append(f.el);
      TT.bus.on('flow', () => this.render());
      TT.bus.on('prefs', (e) => { if (e.key === 'flowMode') this.render(); });
      this.render();
    },
    render() {
      const fl = app().flow;
      if (!fl) return;
      this.chart.setData({ t: fl.t, categories: fl.categories, series: fl.series, unit: fl.unit, mode: app().prefs.flowMode });
      const P = TT.chartPalette();
      const sum = (a) => a.reduce((x, y) => x + y, 0);
      const tot24 = sum(fl.categories.map((c) => sum(fl.series[c].slice(-24))));
      this.tbody.replaceChildren.apply(this.tbody, fl.categories.map((c, k) => { const s = fl.series[c]; return H('tr', null, H('td', null, H('i', { class: 'sw', style: { color: P.series[k] } }), ' ' + c), H('td', { class: 'num' }, F.mm(s[s.length - 1])), H('td', { class: 'num' }, F.mm(sum(s.slice(-24)))), H('td', { class: 'num' }, F.mm(sum(s))), H('td', { class: 'num' }, tot24 ? F.num((sum(s.slice(-24)) / tot24) * 100, 1) + '%' : '—')); }));
      TT.setText(this.src, 'Source: ' + fl.source + ' · gross flows, ' + fl.unit + ' per hour · 72 hourly points · as of ' + F.utc(fl.asOf));
      this.f.sub(fl.unit + ' · 72h · ' + (app().prefs.flowMode === 'share' ? 'share of total' : 'absolute') + ' · ' + fl.source);
    },
  };

  /* ===================== F5 / F6 tables ===================== */
  function tableView(kind, title) {
    const cols = [
      { k: 'pin', label: 'PIN', w: 44, sort: false },
      { k: 'sym', label: 'SYMBOL', w: 96 },
      { k: 'name', label: 'NAME', w: null },
      { k: 'px', label: 'LAST', w: 112, num: true },
      { k: 'chg', label: 'CHG', w: 96, num: true },
      { k: 'chgPct', label: 'CHG%', w: 96, num: true },
      { k: 'hi', label: 'HIGH', w: 108, num: true },
      { k: 'lo', label: 'LOW', w: 108, num: true },
      { k: 'volume', label: 'VOLUME', w: 92, num: true },
      { k: 'spark', label: '1D', w: 76, sort: false },
      { k: 'ts', label: 'UPDATED', w: 92, num: true },
    ];
    return {
      title: title,
      mount(el) {
        const search = H('input', { class: 'input', type: 'search', id: kind + '-filter', placeholder: 'Filter symbol or name', 'aria-label': 'Filter ' + title.toLowerCase(), style: { width: '220px' } });
        this.count = H('span', { class: 'muted' });
        const f = frame(title, H('div', { class: 'pa' }, this.count, search));
        this.f = f;
        this.sort = { k: 'ord', dir: 1 };
        this.thead = H('tr', null, cols.map((c) => H('th', { class: c.num ? 'num' : null, scope: 'col', 'aria-sort': c.sort === false ? null : 'none', dataset: { k: c.k } }, c.sort === false ? c.label : H('button', { type: 'button', onclick: () => this.sortBy(c.k) }, c.label))));
        this.tbody = H('tbody');
        const table = H('table', { class: 'tbl', 'aria-label': title }, H('colgroup', null, cols.map((c) => H('col', { style: c.w ? { width: c.w + 'px' } : null }))), H('thead', null, this.thead), this.tbody);
        this.wrap = H('div', { class: 'tbl-wrap' }, table);
        f.body.append(this.wrap);
        el.append(f.el);
        TT.ui.skeletonRows(this.tbody, cols.length, 18);
        this.rows = new Map(); this.data = new Map(); this.selected = null;
        // Big feeds (more than LAZY rows) only paint rows near the viewport; the rest paint when scrolled into view.
        this.io = new IntersectionObserver((entries) => entries.forEach((e) => {
          const tr = e.target; tr._vis = e.isIntersecting;
          if (tr._vis && tr._dirty) { const q = this.data.get(tr.dataset.sym); if (q) this.paintRow(tr, q, 0); }
        }), { root: this.wrap, rootMargin: '300px 0px' });
        search.addEventListener('input', () => this.filter(search.value));
        this.tbody.addEventListener('click', (e) => {
          const pin = e.target.closest('button.pin');
          const tr = e.target.closest('tr.row');
          if (!tr) return;
          if (pin) { e.stopPropagation(); app().toggleWatch(tr.dataset.sym); return; }
          this.openRow(tr.dataset.sym);
        });
        TT.ui.roving(this.tbody, 'tr.row', { onEnter: (tr) => this.openRow(tr.dataset.sym), onKey: (e, tr) => { if (e.key.toLowerCase() === 'p' && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); app().toggleWatch(tr.dataset.sym); } } });
        TT.bus.on('watch', (e) => {
          if (e && e.sym) { const tr = this.rows.get(e.sym); if (tr) this.paintPin(tr, e.sym); }
          else this.rows.forEach((tr, sym) => this.paintPin(tr, sym)); // whole list replaced (demo exit)
        });
        this.poll = new TT.ui.Poller(kind, () => app().api.quotes({ kind: kind }), 2000, { onData: (r) => this.update(r), onError: () => { this.f.sub('Feed disconnected. Retrying. Showing last known data.'); } });
        this.skelUntil = Date.now() + 400;
      },
      update(r) {
        const wait = this.skelUntil - Date.now();
        if (!this.rows.size && wait > 0) { setTimeout(() => this.update(r), wait); return; }
        const t0 = performance.now();
        if (!this.rows.size) {
          this.lazy = r.rows.length > 300;
          r.rows.forEach((q) => { this.data.set(q.sym, q); this.rows.set(q.sym, this.rowEl(q)); });
          this.order();
          TT.ui.rovingReset(this.tbody, 'tr.row');
        } else {
          const seen = new Set();
          let changedSet = false;
          r.rows.forEach((q) => {
            seen.add(q.sym);
            const prev = this.data.get(q.sym);
            this.data.set(q.sym, q);
            const tr = this.rows.get(q.sym);
            if (!tr) { this.rows.set(q.sym, this.rowEl(q)); changedSet = true; }
            else if (prev && prev.px !== q.px) { if (!this.lazy || tr._vis) this.paintRow(tr, q, q.px > prev.px ? 1 : -1); else tr._dirty = true; }
          });
          Array.from(this.rows.keys()).forEach((sym) => {
            if (seen.has(sym)) return;
            this.io.unobserve(this.rows.get(sym));
            this.rows.get(sym).remove(); this.rows.delete(sym); this.data.delete(sym); changedSet = true;
            if (this.selected === sym) TT.ui.closeDrawer();
          });
          // Keep a value sort current, but never move rows out from under the pointer or the keyboard.
          const valueSort = ['ord', 'sym', 'name'].indexOf(this.sort.k) < 0;
          const busy = this.tbody.matches(':hover') || this.tbody.contains(document.activeElement);
          if (changedSet || (valueSort && !busy)) {
            const ae = document.activeElement;
            this.order();
            if (ae && this.tbody.contains(ae)) ae.focus({ preventScroll: true });
            if (this.filterText) this.filter(this.filterText);
            TT.ui.rovingReset(this.tbody, 'tr.row');
          }
        }
        this.f.sub(r.source + ' · 2s · ' + r.rows.length + ' instruments · ' + F.utc(r.asOf));
        TT.setText(this.count, this.filterText && this.filterText.trim() ? this.visibleCount() + ' of ' + this.rows.size + ' match' : '');
        this.lastMs = performance.now() - t0;
      },
      rowEl(q) {
        const tr = H('tr', { class: 'row', tabindex: '-1', dataset: { sym: q.sym } }, cols.map((c) => H('td', { class: (c.num ? 'num ' : '') + (c.k === 'sym' ? 'sym' : '') + (c.k === 'spark' ? 'spark' : '') + (c.k === 'name' ? ' trunc' : '') })));
        tr.children[0].append(H('button', { class: 'pin', type: 'button', 'aria-label': 'Pin ' + q.sym + ' to watchlist' }, '◆'));
        tr.children[1].textContent = q.sym;
        tr.children[2].textContent = q.name;
        tr.children[2].dataset.src = 'Source: ' + kind + ' feed';
        if (this.lazy) tr._dirty = true; else this.paintRow(tr, q, 0);
        this.paintPin(tr, q.sym);
        this.io.observe(tr);
        return tr;
      },
      paintPin(tr, sym) {
        const on = app().isWatched(sym);
        const b = tr.children[0].firstChild;
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.setAttribute('aria-label', (on ? 'Unpin ' : 'Pin ') + sym + (on ? ' from watchlist' : ' to watchlist'));
        tr.classList.toggle('ctx', on);
      },
      paintRow(tr, q, dir) {
        tr._dirty = false;
        const c = tr.children;
        const d = TT.decimalsFor(q.kind);
        TT.setText(c[3], F.price(q.px, q.kind));
        const chgCls = 'num ' + TT.dir(q.chg);
        c[4].className = chgCls; TT.setText(c[4], TT.tri(q.chg) + ' ' + F.delta(q.chg, d));
        c[5].className = chgCls; TT.setText(c[5], F.pct(q.chgPct));
        TT.setText(c[6], F.price(q.hi, q.kind)); TT.setText(c[7], F.price(q.lo, q.kind));
        TT.setText(c[8], F.int(q.volume));
        c[9].replaceChildren(TT.sparkNode(q.spark, 60, 18));
        TT.setText(c[10], F.utc(q.ts));
        if (dir) { TT.ui.flash(c[3], dir); TT.ui.flash(c[5], dir); }
      },
      sortBy(k) {
        const t0 = performance.now();
        this.sort = { k: k, dir: this.sort.k === k ? -this.sort.dir : (k === 'sym' || k === 'name' ? 1 : -1) };
        TT.$$('th', this.thead).forEach((th) => { if (th.hasAttribute('aria-sort')) th.setAttribute('aria-sort', th.dataset.k === k ? (this.sort.dir > 0 ? 'ascending' : 'descending') : 'none'); });
        this.order();
        this.lastSortMs = performance.now() - t0;
      },
      order() {
        const { k, dir } = this.sort;
        const list = Array.from(this.data.values()).sort((a, b) => {
          const x = a[k], y = b[k];
          if (typeof x === 'string') return x.localeCompare(y) * dir;
          return ((x == null ? -Infinity : x) - (y == null ? -Infinity : y)) * dir;
        });
        const frag = document.createDocumentFragment();
        list.forEach((q) => frag.append(this.rows.get(q.sym)));
        this.tbody.replaceChildren(frag);
      },
      filter(text) {
        this.filterText = text;
        const t = text.trim().toLowerCase();
        this.rows.forEach((tr, sym) => { const q = this.data.get(sym); tr.hidden = !!t && sym.toLowerCase().indexOf(t) < 0 && q.name.toLowerCase().indexOf(t) < 0; });
        TT.setText(this.count, this.filterText && this.filterText.trim() ? this.visibleCount() + ' of ' + this.rows.size + ' match' : '');
      },
      visibleCount() { let n = 0; this.rows.forEach((tr) => { if (!tr.hidden) n++; }); return n; },
      async openRow(sym) {
        if (this._drawerChart) { this._drawerChart.destroy(); this._drawerChart = null; }
        this.rows.forEach((tr, s) => tr.classList.toggle('sel', s === sym));
        this.selected = sym;
        const q = this.data.get(sym) || app().quotes.get(sym);
        const host = H('div', { class: 'chart', style: { height: '220px', flex: 'none' }, role: 'img', 'aria-label': sym + ' intraday chart' });
        const view = this;
        const d = TT.ui.openDrawer({
          owner: this, kind: 'symbol', title: sym + (q ? ' · ' + q.name : ''), tag: H('span', { class: 'tag macro' }, kind === 'fx' ? 'fx' : 'futures'),
          onClose: () => { if (view._drawerChart) { view._drawerChart.destroy(); view._drawerChart = null; } this.rows.forEach((tr) => tr.classList.remove('sel')); view.selected = null; },
          render(body, acts) {
            const cell = (k, v, cls) => H('div', null, H('span', { class: 'k', text: k }), H('span', { class: 'v sm ' + (cls || ''), text: v }));
            if (q) body.append(H('div', { class: 'dl' }, cell('Last', F.price(q.px, q.kind)), cell('Change', TT.tri(q.chg) + ' ' + F.delta(q.chg, TT.decimalsFor(q.kind)) + ' · ' + F.pct(q.chgPct), TT.dir(q.chg)), cell('High', F.price(q.hi, q.kind)), cell('Low', F.price(q.lo, q.kind)), cell('Prior settle', F.price(q.prev, q.kind)), cell('Volume', F.int(q.volume))));
            body.append(host, H('div', { class: 'prov' }, 'Source: ' + kind + ' feed · 15 min bars · last 24h · UTC'));
            const watched = app().isWatched(sym);
            acts.append(
              H('button', { class: 'btn btn-amber btn-lg', type: 'button', onclick: () => { app().toggleWatch(sym); view.openRow(sym); } }, watched ? 'UNPIN' : 'PIN'),
              H('button', { class: 'btn btn-lg', type: 'button', onclick: () => { if (!app().isPinned('symbol', sym)) app().togglePin({ kind: 'symbol', id: sym, label: sym }); TT.ui.toast('Added ' + sym + ' to agent context.'); } }, 'ADD TO CONTEXT'),
              H('button', { class: 'btn btn-lg', type: 'button', onclick: () => { TT.ui.closeDrawer(); TT.router.go('agent'); app().ask('How is ' + sym + '?'); } }, 'ASK AGENT'));
          },
        });
        try {
          const s = await app().api.series({ sym: sym });
          if (TT.ui.drawer() !== d || this.selected !== sym) return;
          this._drawerChart = new TT.LineChart(host, { yFmt: (v) => F.price(v, q ? q.kind : 'commodity') });
          this._drawerChart.setData({ series: [{ id: sym, label: sym, kind: s.kind, points: s.points, color: TT.cssVar('--s1'), area: true }], yLabel: 'PRICE', xLabel: 'TIME (UTC)' });
        } catch (err) { host.replaceChildren(H('div', { class: 'empty' }, 'Chart unavailable. ' + err.message)); }
      },
      show(params) {
        if (!app().api.quotes) { this.f.sub('Not connected: backend has no quotes() method.'); return; }
        this.poll.start(); this.poll.now();
        if (params[0]) {
          const sym = params[0].toUpperCase();
          let tries = 0;
          const go = () => {
            if (TT.router.current.view !== kind) return;
            if (this.rows.has(sym)) { this.openRow(sym); this.rows.get(sym).scrollIntoView({ block: 'center' }); }
            else if (this.rows.size && tries >= 3) TT.ui.toast('No instrument ' + sym + ' in ' + title.toLowerCase() + '.');
            else if (++tries < 60) setTimeout(go, 150);
            else TT.ui.toast('No instrument ' + sym + ' in ' + title.toLowerCase() + '.');
          };
          go();
        }
      },
      hide() { this.poll.stop(); },
    };
  }
  TT.views.commodities = tableView('commodities', 'COMMODITIES');
  TT.views.fx = tableView('fx', 'FX');

  /* ===================== F7 Satellite intel ===================== */
  // Cadence comes only from the backend (optional sites().cadenceH). Without it the cell shows a dash, never a guess.
  function cadenceText(h) {
    if (typeof h !== 'number' || !(h > 0)) return '—';
    if (h >= 168 && h % 168 === 0) return h === 168 ? 'weekly' : 'every ' + (h / 168) + 'w';
    if (h >= 48) return 'every ' + Math.round(h / 24) + 'd';
    if (h >= 24) return 'daily';
    return 'every ' + TT.round(h, 1) + 'h';
  }
  TT.views.intel = {
    title: 'SATELLITE INTEL',
    mount(el) {
      const f = frame('SATELLITE INTEL');
      this.f = f;
      this.tbody = H('tbody');
      const table = H('table', { class: 'tbl', 'aria-label': 'Monitored sites' },
        H('colgroup', null, H('col', { style: { width: '22%' } }), H('col', { style: { width: '96px' } }), H('col', { style: { width: '140px' } }), H('col', { style: { width: '150px' } }), H('col', { style: { width: '60px' } }), H('col', { style: { width: '84px' } }), H('col', { style: { width: '64px' } }), H('col'), H('col', { style: { width: '80px' } })),
        H('thead', null, H('tr', null, ['SITE', 'TYPE', 'REGION', 'LATEST PASS', 'AGE', 'SEGMENTS', 'ALERTS', 'KEY SIGNAL', 'CADENCE'].map((t, k) => H('th', { class: k >= 4 && k <= 6 ? 'num' : null, scope: 'col' }, t)))), this.tbody);
      this.cards = H('div', { class: 'intel-grid', role: 'list', 'aria-label': 'Latest pass per site' });
      f.body.append(H('div', { class: 'tbl-wrap', style: { flex: 'none' } }, table), H('div', { class: 'intel-cards' }, this.cards));
      el.append(f.el);
      TT.ui.skeletonRows(this.tbody, 9, 6);
      TT.ui.roving(this.tbody, 'tr.row', { onEnter: (tr) => TT.router.go('orbital/' + tr.dataset.site) });
      this.tbody.addEventListener('click', (e) => { const tr = e.target.closest('tr.row'); if (tr) TT.router.go('orbital/' + tr.dataset.site); });
      TT.bus.on('sites', () => this.render());
      TT.bus.on('alerts', () => this.render());
      TT.bus.on('tick', () => { if (visibleView('intel')) this.render(); });
    },
    render() {
      const sites = app().sites;
      if (!sites.length) return;
      const focused = document.activeElement && this.tbody.contains(document.activeElement) ? document.activeElement.dataset.site : null;
      this.tbody.replaceChildren.apply(this.tbody, sites.map((s, k) => {
        const active = app().activeAlerts().filter((a) => a.site === s.id).length;
        const m = s.keyMetric;
        return H('tr', { class: 'row', tabindex: (focused ? focused === s.id : k === 0) ? '0' : '-1', dataset: { site: s.id }, 'aria-label': s.name + ', ' + active + ' active alerts' },
          H('td', { class: 'sym trunc' }, H('span', { class: 'tag cls-' + s.cls, style: { marginRight: '8px' } }, s.cls), s.name),
          H('td', null, s.type), H('td', { class: 'trunc' }, s.region), H('td', null, F.utcDate(s.latestPass)), H('td', { class: 'num' }, F.age(s.latestPass)),
          H('td', { class: 'num' }, String(s.segments)), H('td', { class: 'num' + (active ? ' down' : ' muted') }, active ? active + ' ▲' : '0'),
          H('td', { class: 'trunc' }, s.keyLabel + ' · ' + m.name + ' ' + TT.metricText(m) + ' · ' + TT.metricDelta(m) + ' · conf ' + TT.fmt.conf(s.keyConf)),
          H('td', null, cadenceText(s.cadenceH)));
      }));
      if (focused) { const r = this.tbody.querySelector('[data-site="' + focused + '"]'); if (r) r.focus(); }
      this.renderCards(sites);
      this.f.sub(sites.length + ' sites · ' + app().activeAlerts().length + ' active alerts · as of ' + F.utc(app().sitesAsOf));
    },
    renderCards(sites) {
      if (!this.cardEls) this.cardEls = new Map();
      const ids = new Set(sites.map((s) => s.id));
      this.cardEls.forEach((c, id) => { if (!ids.has(id)) { c.remove(); this.cardEls.delete(id); } });
      sites.forEach((s) => {
        let c = this.cardEls.get(s.id);
        if (!c) {
          const canvas = H('canvas', { width: 384, height: 240, role: 'img', 'aria-label': s.name + ' latest pass' });
          const body = H('div', { class: 'sc-body' });
          c = H('button', { class: 'site-card', type: 'button', role: 'listitem', dataset: { site: s.id }, onclick: () => TT.router.go('orbital/' + s.id) }, canvas, body);
          c._body = body;
          app().imagery(s.id).then((r) => TT.Imagery.drawCrop(r.pass, canvas)).catch(() => null);
          this.cardEls.set(s.id, c);
          this.cards.append(c);
        }
        const m = s.keyMetric;
        const active = app().activeAlerts().filter((a) => a.site === s.id).length;
        const vals = (s.keySeries || []).map((p) => p.v).filter((v) => typeof v === 'number');
        let trend = null;
        if (vals.length > 1) {
          trend = H('div', { class: 'sc-trend' });
          trend.append(TT.sparkNode(vals, 120, 22, 'geo'), H('span', null, vals.length + ' passes'));
        }
        c._body.replaceChildren(
          H('div', { class: 'sc-name trunc' }, H('span', { class: 'tag cls-' + s.cls, style: { marginRight: '8px' } }, s.cls), s.name),
          H('div', { class: 'sc-meta' }, s.type + ' · ' + s.region + ' · pass ' + F.age(s.latestPass) + ' ago'),
          H('div', { class: 'sc-key' }, s.keyLabel + ' ' + TT.metricText(m)),
          H('div', { class: 'sc-meta' }, m.name + ' ' + TT.metricDelta(m) + ' vs prior pass · conf ' + TT.fmt.conf(s.keyConf)),
          trend,
          H('div', { class: 'sc-meta' + (active ? ' down' : '') }, active ? active + ' active alert' + (active > 1 ? 's' : '') : 'No active alerts'));
      });
    },
    show() { this.render(); },
  };

  /* ===================== F8 Alerts ===================== */
  TT.views.alerts = {
    title: 'ALERTS',
    mount(el) {
      this.filterMode = 'active';
      const seg = H('div', { class: 'seg-ctl', role: 'group', 'aria-label': 'Show' }, [['active', 'ACTIVE'], ['all', 'ALL'], ['acked', 'ACKNOWLEDGED']].map(([m, l]) => H('button', { type: 'button', dataset: { m: m }, 'aria-pressed': m === 'active' ? 'true' : 'false', onclick: () => { this.filterMode = m; TT.$$('button', seg).forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === m ? 'true' : 'false')); this.render(); } }, l)));
      const ackAll = H('button', { class: 'btn', type: 'button', onclick: () => app().ackAll() }, 'ACKNOWLEDGE ALL');
      const f = frame('ALERTS', H('div', { class: 'pa' }, seg, ackAll));
      this.f = f;
      this.tbody = H('tbody');
      const table = H('table', { class: 'tbl', 'aria-label': 'Alert inbox' },
        H('colgroup', null, H('col', { style: { width: '70px' } }), H('col', { style: { width: '240px' } }), H('col'), H('col', { style: { width: '62px' } }), H('col', { style: { width: '62px' } }), H('col', { style: { width: '150px' } })),
        H('thead', null, H('tr', null, ['SEV', 'SUBJECT', 'MESSAGE', 'CONF', 'AGE', 'STATUS'].map((t, k) => H('th', { class: k === 3 || k === 4 ? 'num' : null, scope: 'col' }, t)))), this.tbody);
      this.rulesEl = H('div', { style: { display: 'grid', gap: '6px' } });
      const sym = H('select', { id: 'rule-sym', 'aria-label': 'Symbol' });
      const metric = H('select', { id: 'rule-metric' }, H('option', { value: 'chgPct' }, 'Change % (bp for yields)'), H('option', { value: 'px' }, 'Last price'));
      const op = H('select', { id: 'rule-op' }, H('option', { value: '>' }, 'above'), H('option', { value: '<' }, 'below'));
      const thr = H('input', { class: 'input', id: 'rule-thr', type: 'number', step: 'any', required: true, value: '3' });
      const ch = H('select', { id: 'rule-ch' }, H('option', { value: 'both' }, 'Toast and agent log'), H('option', { value: 'toast' }, 'Toast only'), H('option', { value: 'agent' }, 'Agent log only'));
      const form = H('form', { class: 'form-grid' },
        H('label', { for: 'rule-sym' }, 'Symbol', sym), H('label', { for: 'rule-metric' }, 'Metric', metric), H('label', { for: 'rule-op' }, 'Condition', op),
        H('label', { for: 'rule-thr' }, 'Threshold', thr), H('label', { for: 'rule-ch' }, 'Channel', ch), H('button', { class: 'btn btn-amber btn-lg', type: 'submit' }, 'ADD RULE'));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = parseFloat(thr.value);
        if (!Number.isFinite(v)) { thr.focus(); return; }
        app().addRule({ sym: sym.value, metric: metric.value, op: op.value, threshold: v, channel: ch.value });
      });
      this.symSel = sym;
      f.body.append(H('div', { class: 'tbl-wrap' }, table),
        H('section', { class: 'fv-pad', style: { borderTop: '1px solid var(--gutter)', display: 'grid', gap: '10px', flex: 'none' }, 'aria-label': 'Alert rules' },
          H('div', { class: 'sh', style: { border: 0, padding: 0, height: 'auto' } }, H('h2', { class: 'pt', style: { margin: 0 } }, 'RULES'), H('span', { class: 'ps', text: 'threshold plus channel · evaluated on every quote update' })), this.rulesEl, form));
      el.append(f.el);
      TT.bus.on('alerts', () => this.render());
      TT.bus.on('rules', () => this.renderRules());
      TT.bus.on('watch', () => this.renderRules());
      TT.bus.on('tick', () => { if (visibleView('alerts')) this.renderAges(); });
      this.render(); this.renderRules();
    },
    list() {
      const all = app().alerts;
      return this.filterMode === 'active' ? all.filter((a) => !a.acked) : this.filterMode === 'acked' ? all.filter((a) => a.acked) : all;
    },
    render() {
      const items = this.list();
      if (!items.length) this.tbody.replaceChildren(H('tr', null, H('td', { colspan: '6', class: 'empty' }, this.filterMode === 'acked' ? 'No acknowledged alerts.' : 'No alerts. The agent is watching.')));
      else this.tbody.replaceChildren.apply(this.tbody, items.map((a) => H('tr', { dataset: { id: a.id } },
        H('td', null, H('span', { class: 'tag sev-' + a.sev }, a.sev === 'high' ? 'HIGH' : a.sev === 'med' ? 'MED' : 'LOW')),
        H('td', { class: 'trunc' }, a.route ? H('button', { type: 'button', class: 'info', onclick: () => TT.router.go(a.route) }, a.subject) : a.subject),
        H('td', { class: 'trunc', 'data-src': 'Source: ' + a.source }, a.message),
        H('td', { class: 'num' }, a.conf != null ? TT.fmt.conf(a.conf) : '—'),
        H('td', { class: 'num age', dataset: { ts: String(a.ts) } }, F.age(a.ts)),
        H('td', null, a.acked ? H('span', { class: 'muted' }, 'ACKNOWLEDGED') : H('button', { class: 'btn', type: 'button', onclick: () => { app().ack(a.id); TT.ui.toast('Alert acknowledged.'); } }, 'ACKNOWLEDGE')))));
      this.f.sub(app().activeAlerts().length + ' active · ' + app().alerts.length + ' total · detectors and rules');
    },
    renderAges() { TT.$$('td.age', this.tbody).forEach((td) => TT.setText(td, F.age(Number(td.dataset.ts)))); },
    renderRules() {
      const syms = Array.from(new Set(app().watch.concat(TT.KPI.map((k) => k[1]))));
      if (Array.from(this.symSel.options).map((o) => o.value).join(',') !== syms.join(',')) { const cur = this.symSel.value; this.symSel.replaceChildren.apply(this.symSel, syms.map((s) => H('option', { value: s }, s))); if (cur) this.symSel.value = cur; }
      const rules = app().rules;
      this.rulesEl.replaceChildren.apply(this.rulesEl, rules.length ? rules.map((r) => H('div', { class: 'sys-row', style: { justifyContent: 'flex-start', gap: '12px' } },
        H('span', { class: 'tag ' + (r.armed ? 'info' : 'sev-med') }, r.armed ? 'ARMED' : 'FIRED'),
        H('span', null, H('b', null, r.sym), ' ' + (r.metric === 'chgPct' ? 'change' : 'last') + ' ' + (r.op === '>' ? 'above' : 'below') + ' ' + r.threshold + ' · ' + (r.channel === 'both' ? 'toast and agent log' : r.channel === 'toast' ? 'toast' : 'agent log')),
        H('button', { class: 'btn btn-ghost', type: 'button', 'aria-label': 'Remove rule for ' + r.sym, onclick: () => app().removeRule(r.id) }, 'REMOVE'))) : [H('span', { class: 'muted' }, 'No rules yet.')]);
    },
    show() { this.render(); },
  };
})();
