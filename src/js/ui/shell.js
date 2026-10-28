/* Shell: frame (top bar, function bar, tape, status bar), router, global keyboard, demo mode, boot. */
(function () {
  'use strict';
  const TT = window.TT;
  const H = TT.h;
  const F = TT.fmt;
  const app = TT.app;
  const REQUIRED = ['watchlist', 'macro', 'imagery', 'ask'];
  const OPTIONAL = ['sites', 'quotes', 'series', 'flow', 'wire', 'events', 'system'];
  const VIEW_IDS = ['desk', 'macro', 'orbital', 'agent', 'flow', 'commodities', 'fx', 'intel', 'alerts'];
  const ALIASES = { '': 'desk', home: 'desk', f1: 'macro', f2: 'orbital', f3: 'agent', f4: 'flow', f5: 'commodities', f6: 'fx', f7: 'intel', f8: 'alerts', satellite: 'intel', sat: 'intel', system: 'desk' };

  /* ---------- frame ---------- */
  const mark = () => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('width', '18'); s.setAttribute('height', '18'); s.setAttribute('viewBox', '0 0 18 18'); s.setAttribute('aria-hidden', 'true'); s.classList.add('amber'); s.innerHTML = '<rect x="1" y="1" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="9" cy="9" r="3.2" fill="currentColor"/><path d="M9 1.5v3M9 13.5v3M1.5 9h3M13.5 9h3" stroke="currentColor" stroke-width="1.5"/>'; return s; };
  const shell = (TT.shell = {});

  function buildFrame(root) {
    const mkt = H('div', { class: 'mkt' }, H('span', { class: 'dot' }), H('span', { class: 'mkt-label' }, 'NYSE '), H('b', null, ''));
    const models = H('div', { class: 'models', 'aria-label': 'Model health' });
    const clock = H('div', { class: 'clock', 'aria-label': 'UTC time' }, H('span', { class: 'clock-date muted' }, ''), ' ', H('span', null, ''));
    const demoBadge = H('span', { class: 'badge', hidden: true }, 'DEMO');
    const brand = H('a', { class: 'brand', href: '#/desk', 'aria-label': 'TERRATERM desk' }, mark(), H('span', null, 'TERRATERM'));
    const top = H('header', { class: 'topbar' }, brand, app.config.org ? H('span', { class: 'org' }, app.config.org) : null, demoBadge, mkt, models, clock);
    const links = [H('a', { href: '#/desk', dataset: { view: 'desk' }, 'data-tip': 'Desk \u00b7 Alt+0' }, H('kbd', null, '\u2302'), 'DESK')]
      .concat(TT.VIEWS.map((v) => H('a', { href: '#/' + v.id, dataset: { view: v.id } }, H('kbd', null, v.key), v.label.replace('intelligence', '').replace('dashboard', '').trim().toUpperCase(), v.id === 'alerts' ? H('span', { class: 'fb-count' }, '') : null)));
    const fbar = H('nav', { class: 'fbar', 'aria-label': 'Views' }, links);
    fbar.addEventListener('click', (e) => { const a = e.target.closest('a[data-view]'); if (a) { e.preventDefault(); TT.router.go(a.dataset.view); } });
    brand.addEventListener('click', (e) => { e.preventDefault(); TT.router.go('desk'); });
    const tapeTrack = H('div', { class: 'tape-track', 'aria-hidden': 'true' });
    const tape = H('div', { class: 'tape', hidden: !app.prefs.tape, role: 'marquee', 'aria-label': 'Ticker tape' }, tapeTrack);
    const main = H('main', { id: 'main' });
    const views = {};
    VIEW_IDS.forEach((id) => { views[id] = H('section', { class: 'view', id: 'view-' + id, hidden: true, tabindex: '-1', 'aria-label': id === 'desk' ? 'Desk' : (TT.VIEWS.find((v) => v.id === id) || {}).label }); main.append(views[id]); });
    const feedSb = H('button', { class: 'sb', type: 'button', 'data-tip': 'Feed health' }, H('span', { class: 'dot st-ok' }), H('span', null, 'FEED '), H('b', null, 'LIVE'));
    const modelSb = H('span', { class: 'sb sb-opt' }, '');
    const ctxSb = H('span', { class: 'sb' }, 'CTX ', H('span', { class: 'ctx-mini' }, H('i', { style: { width: '0%' } })), H('b', null, '—'));
    const alertSb = H('button', { class: 'sb', type: 'button', onclick: () => TT.router.go('alerts') }, 'ALERTS ', H('b', null, '0'));
    const demoSb = H('span', { class: 'sb amber', hidden: true });
    const modeSb = H('span', { class: 'sb sb-mode' + (app.mode === 'scaffold' ? ' amber' : '') }, app.mode.toUpperCase());
    const hints = H('span', { class: 'sb-hints' }, H('span', null, H('kbd', null, '/'), ' CMD'), H('span', null, H('kbd', null, '?'), ' KEYS'), H('span', null, H('kbd', null, 'F1–F8'), ' VIEWS'), modeSb, H('span', null, 'v' + TT.VERSION));
    const status = H('footer', { class: 'status' }, feedSb, modelSb, ctxSb, alertSb, demoSb, hints);
    feedSb.addEventListener('click', () => { if (app.feed.status !== 'live') app.retryFeed(); });
    root.append(top, fbar, tape, main, status);
    shell.el = { mkt: mkt, models: models, clock: clock, links: links, tape: tape, tapeTrack: tapeTrack, main: main, views: views, feedSb: feedSb, modelSb: modelSb, ctxSb: ctxSb, alertSb: alertSb, demoSb: demoSb, demoBadge: demoBadge, modeSb: modeSb };
  }

  function tickClock() {
    const now = Date.now();
    const e = shell.el;
    const d = new Date(now);
    TT.setText(e.clock.lastChild, F.utc(now));
    TT.setText(e.clock.firstChild, d.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' }).toUpperCase());
    const ms = TT.marketState(now);
    e.mkt.className = 'mkt ' + (ms.open ? 'open' : 'closed');
    e.mkt.firstChild.className = 'dot' + (ms.open ? ' pulse' : '');
    TT.setText(e.mkt.lastChild, ms.label);
    if (app.demo.on) {
      const s = Math.floor((now - app.demo.t0) / 1000);
      TT.setText(e.demoSb, 'DEMO ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' · BEAT ' + app.demo.beat + '/5 · N NEXT');
    }
  }
  function renderSystem() {
    const s = app.system; if (!s) return;
    const e = shell.el;
    const lat = (m) => (Number.isFinite(m.latencyMs) ? m.latencyMs + 'ms' : '');
    e.models.replaceChildren.apply(e.models, s.models.map((m, k) => H('span', { class: 'model' + (k === 1 ? ' opt' : ''), 'data-tip': [m.name, m.role, m.where, lat(m)].filter(Boolean).join(' · ') }, H('span', { class: 'dot ' + (m.status === 'ok' ? 'st-ok' : m.status === 'degraded' ? 'st-warn' : 'st-down') }), H('b', null, m.name), m.where === 'local' ? 'LOCAL' : lat(m))));
    TT.setText(e.modelSb, s.models.map((m) => m.name + (m.where === 'local' ? ' local' : '')).join(' · '));
    const mini = e.ctxSb.querySelector('.ctx-mini');
    if (!s.context) { mini.className = 'ctx-mini'; mini.firstChild.style.width = '0%'; TT.setText(e.ctxSb.lastChild, '—'); return; }
    const pct = s.context.used / s.context.max;
    mini.className = 'ctx-mini' + (pct > 0.9 ? ' crit' : pct > 0.7 ? ' warn' : '');
    mini.firstChild.style.width = (pct * 100).toFixed(1) + '%';
    TT.setText(e.ctxSb.lastChild, F.tokens(s.context.used) + ' / ' + F.tokens(s.context.max));
  }
  function renderFeed() {
    const e = shell.el;
    const live = app.feed.status === 'live';
    e.feedSb.firstChild.className = 'dot ' + (live ? 'st-ok' : 'st-down');
    TT.setText(e.feedSb.lastChild, live ? 'LIVE' : 'DOWN · RETRYING');
    e.feedSb.dataset.tip = live ? 'Feed live · last update ' + F.utc(app.feed.lastOk || Date.now()) : 'Feed disconnected. Retrying. Click to retry now.';
  }
  function renderAlerts() {
    const n = app.activeAlerts().length;
    const e = shell.el;
    TT.setText(e.alertSb.lastChild, String(n));
    e.alertSb.classList.toggle('alerts-on', n > 0);
    const cnt = e.links[e.links.length - 1].querySelector('.fb-count');
    if (cnt) TT.setText(cnt, n ? '· ' + n : '');
  }
  function renderTape() {
    const e = shell.el;
    if (e.tape.hidden) return;
    const syms = Array.from(new Set(app.watch.concat(TT.KPI.map((k) => k[1]))));
    const item = (sym) => { const q = app.quotes.get(sym); if (!q) return null; const d = q.kind === 'yield' ? q.chg : q.chgPct; return H('span', { class: 'tape-item' }, H('b', null, sym), (q.kind === 'yield' ? F.price(q.px, 'yield') + '%' : F.price(q.px, q.kind)) + ' ', H('span', { class: TT.dir(d) }, TT.tri(d) + ' ' + F.chg(q))); };
    const group = () => H('span', { class: 'tape-group' }, syms.map(item).filter(Boolean));
    e.tapeTrack.replaceChildren(group(), group());
  }
  shell.toggleTape = function () {
    app.setPref('tape', !app.prefs.tape);
    shell.el.tape.hidden = !app.prefs.tape;
    renderTape();
    TT.ui.toast('Ticker tape ' + (app.prefs.tape ? 'on.' : 'off.'));
  };
  function applyMotion() {
    const m = app.prefs.motion;
    const reduce = m === 'reduce' || (m === 'auto' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    document.documentElement.dataset.motion = reduce ? 'reduce' : 'full';
  }
  shell.toggleMotion = function () {
    app.setPref('motion', TT.motionReduced() ? 'full' : 'reduce');
    applyMotion();
    TT.ui.toast(TT.motionReduced() ? 'Motion reduced.' : 'Motion on.');
  };

  /* ---------- router: every view is URL addressable (§7) ---------- */
  const mounted = new Set();
  const router = (TT.router = {
    current: { view: null, params: [] },
    parse(hash) {
      let raw = String(hash || '').replace(/^#/, '').replace(/^\//, '');
      try { raw = decodeURIComponent(raw); } catch (e) { /* keep undecoded */ }
      const parts = raw.split(/[/.]/).filter(Boolean);
      let view = (parts[0] || '').toLowerCase();
      view = ALIASES[view] != null ? ALIASES[view] : view;
      if (view === 'demo') return { view: 'demo', params: [] };
      if (VIEW_IDS.indexOf(view) < 0) view = 'desk';
      return { view: view, params: parts.slice(1) };
    },
    go(route) {
      const hash = '#/' + route;
      if (location.hash === hash) { router.apply(router.parse(hash)); return; }
      try { history.pushState(null, '', hash); } catch (e) { /* sandboxed frames may refuse; apply anyway */ }
      router.apply(router.parse(hash));
    },
    apply(r) {
      if (r.view === 'demo') { TT.demo.start(); return; }
      const prev = router.current.view;
      const sameView = prev === r.view;
      if (TT.palette.isOpen()) TT.palette.close(true);
      if (!sameView || r.view !== 'orbital') TT.ui.closeDrawer();
      if (prev && !sameView && TT.views[prev] && TT.views[prev].hide) TT.views[prev].hide();
      router.current = { view: r.view, params: r.params };
      VIEW_IDS.forEach((id) => { shell.el.views[id].hidden = id !== r.view; });
      if (!mounted.has(r.view)) { mounted.add(r.view); TT.views[r.view].mount(shell.el.views[r.view]); }
      shell.el.links.forEach((a) => { if (a.dataset.view === r.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
      document.title = 'TERRATERM · ' + (r.view === 'desk' ? 'Desk' : (TT.VIEWS.find((v) => v.id === r.view) || {}).label);
      if (TT.views[r.view].show) TT.views[r.view].show(r.params);
      if (!sameView && r.view !== 'agent') {
        const ae = document.activeElement;
        if (!ae || ae === document.body || !shell.el.views[r.view].contains(ae)) shell.el.views[r.view].focus({ preventScroll: true });
      }
      TT.bus.emit('route', router.current);
    },
    init() {
      // Back/forward fires both popstate and hashchange for the same entry; apply the route once.
      const onNav = () => {
        const r = router.parse(location.hash);
        if (r.view !== 'demo' && r.view === router.current.view && r.params.join('/') === router.current.params.join('/')) return;
        router.apply(r);
      };
      window.addEventListener('hashchange', onNav);
      window.addEventListener('popstate', onNav);
      router.apply(router.parse(location.hash));
    },
  });

  /* ---------- keyboard: keyboard first (§2, §7) ---------- */
  let lastPanel = null;
  document.addEventListener('focusin', (e) => { const p = e.target.closest && e.target.closest('.panel, .fv'); if (p) lastPanel = p; });
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    const fk = /^F([1-8])$/.exec(e.key);
    if (fk && !e.ctrlKey && !e.metaKey) { e.preventDefault(); router.go(TT.VIEWS[Number(fk[1]) - 1].id); return; }
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && /^Digit[0-8]$/.test(e.code)) { e.preventDefault(); const n = Number(e.code.slice(5)); router.go(n === 0 ? 'desk' : TT.VIEWS[n - 1].id); return; }
    if (e.key === 'Escape') {
      if (TT.ui.closeTop()) { e.preventDefault(); return; }
      if (app.stopAsk()) { e.preventDefault(); return; }
      const ae = document.activeElement;
      const panel = (ae && ae.closest && ae.closest('.panel, .fv')) || lastPanel;
      if (panel) { e.preventDefault(); (panel.classList.contains('panel') ? panel : panel.parentElement).focus({ preventScroll: true }); }
      return;
    }
    if (TT.isTyping(e.target) || e.ctrlKey || e.metaKey) return;
    const view = TT.views[router.current.view];
    if (view && view.handleKey && view.handleKey(e)) { e.preventDefault(); return; }
    if (e.altKey) return;
    if (e.key === '/') { e.preventDefault(); TT.palette.open(); return; }
    if (e.key === '?') { e.preventDefault(); TT.shortcuts(); return; }
    const k = e.key.toLowerCase();
    if (k === 'a') { e.preventDefault(); if (router.current.view !== 'desk' && router.current.view !== 'agent') router.go('agent'); const v = TT.views[router.current.view]; if (v.focusAgent) v.focusAgent(); return; }
    if (k === 't' && !e.target.closest('tr.row')) { e.preventDefault(); shell.toggleTape(); return; }
    if (k === 'n' && app.demo.on) { e.preventDefault(); TT.demo.next(); }
  });

  /* ---------- demo mode §18: scripted dataset, one key per beat ---------- */
  function setModeLabel() {
    TT.setText(shell.el.modeSb, app.mode.toUpperCase());
    shell.el.modeSb.classList.toggle('amber', app.mode === 'scaffold');
    TT.bus.emit('feed', app.feed);
    TT.bus.emit('mode', app.mode);
  }
  function reloadViewers(site) {
    const desk = TT.views.desk;
    if (desk.viewer) { desk.viewer.stop(); if (site) desk.viewer.load(site); }
    if (TT.views.orbital.viewer) { TT.views.orbital.viewer.stop(); TT.views.orbital.viewer.site = null; }
  }
  TT.demoAllowed = () => app.mode === 'scaffold' || app.demo.on || !!(app.config && app.config.allowDemo);
  let demoSnap = null; // what to go back to when demo mode ends: the user's own backend and mode
  TT.demo = {
    start(snap) {
      if (!TT.demoAllowed()) { TT.ui.toast('Demo mode is off while a live backend is attached.'); router.go('desk'); return; }
      if (!app.demo.on) demoSnap = snap || { api: app.api, mode: app.mode, debug: window.TERRATERM.debug, site: app.orbitalSite };
      const api = TT.mock.createScaffold({ demo: true, config: app.config });
      window.TERRATERM.debug = Object.assign({}, api.__debug, { app: app });
      app.demo = { on: true, t0: Date.now(), beat: 1 };
      app.mode = 'scaffold';
      app.resetData(api);
      app.orbitalSite = TT.mock.home.site;
      setModeLabel();
      shell.el.demoBadge.hidden = false; shell.el.demoSb.hidden = false;
      TT.ui.closeDrawer();
      router.go('desk');
      reloadViewers(TT.mock.home.site);
      TT.ui.toast('Demo mode. Press N for each beat. Your saved pins and conversation are untouched.');
    },
    exit() {
      if (!app.demo.on) return;
      const s = demoSnap || { api: null, mode: 'scaffold', debug: null, site: null };
      demoSnap = null;
      app.demo = { on: false, t0: 0, beat: 0 };
      app.mode = s.mode;
      app.resetData(s.api || TT.mock.createScaffold({ config: app.config }));
      app.restorePersisted();
      if (s.debug) window.TERRATERM.debug = s.debug; else delete window.TERRATERM.debug;
      app.orbitalSite = s.site;
      setModeLabel();
      shell.el.demoBadge.hidden = true; shell.el.demoSb.hidden = true;
      TT.ui.closeDrawer();
      reloadViewers(s.site || (app.sites[0] && app.sites[0].id));
      TT.ui.toast('Demo mode off. Back on the ' + app.mode + ' backend.');
    },
    adopt(snap) { demoSnap = snap; },
    async next() {
      if (!app.demo.on) return;
      const b = app.demo.beat;
      if (b === 1) {
        router.go('desk');
        const v = TT.views.desk.viewer;
        if (v.site !== TT.mock.home.site || !v.res) await v.load(TT.mock.home.site);
        v.select(TT.mock.home.seg);
      } else if (b === 2) {
        const d = TT.ui.drawer();
        const btn = d && TT.$$('.drawer-acts .btn-amber', d.el)[0];
        if (btn) btn.click(); else { const h = TT.mock.home; app.selected = { site: h.site, id: h.seg, pass: h.pass }; app.ask(h.prompt); }
      } else if (b === 3) {
        TT.palette.open();
        TT.palette.type('port');
        await TT.sleep(700);
        TT.palette.runFirst();
        await TT.sleep(400);
        const v = TT.views.orbital.viewer;
        if (v && !v.playing) v.play();
      } else if (b === 4) {
        const v = TT.views.orbital.viewer;
        if (v) v.stop();
        router.go('macro');
      } else return;
      app.demo.beat = Math.min(5, b + 1);
      tickClock();
    },
  };

  /* ---------- boot ---------- */
  function wrap(api) {
    const out = {};
    Object.keys(api).forEach((k) => { if (typeof api[k] === 'function') out[k] = function () { const a = arguments; return Promise.resolve().then(() => api[k].apply(api, a)); }; });
    return out;
  }
  TT.boot = function () {
    const ext = window.TERRATERM || {};
    const demoHash = /^#\/?demo\b/i.test(location.hash);
    const liveApi = !!(ext.api && REQUIRED.every((k) => typeof ext.api[k] === 'function'));
    const config = Object.assign({ org: liveApi ? '' : 'APEX STUDIO', sensorLabel: 'SAT VHR' }, ext.config || {});
    const demo = demoHash && (!liveApi || !!config.allowDemo);
    if (demoHash && !demo) { try { history.replaceState(null, '', '#/desk'); } catch (e) { /* noop */ } }
    const scaffold = TT.mock.createScaffold({ demo: false, config: config });
    let api = scaffold, mode = 'scaffold', fallbacks = [];
    if (ext.api && REQUIRED.every((k) => typeof ext.api[k] === 'function')) {
      fallbacks = OPTIONAL.filter((k) => typeof ext.api[k] !== 'function');
      api = Object.assign({}, scaffold);
      REQUIRED.concat(OPTIONAL).forEach((k) => { if (typeof ext.api[k] === 'function') api[k] = ext.api[k].bind(ext.api); });
      mode = ext.mode || 'live';
      fallbacks.forEach((k) => { delete api[k]; });
      delete api.__debug;
    } else if (ext.api) {
      console.warn('[TERRATERM] window.TERRATERM.api is missing one of: ' + REQUIRED.join(', ') + '. Running on the scaffold backend.');
    }
    app.api = wrap(api); app.mode = mode; app.config = config; app.fallbacks = fallbacks;
    window.TERRATERM = Object.assign(ext, { api: app.api, mode: mode, config: config, version: TT.VERSION, app: app });
    if (mode === 'scaffold') window.TERRATERM.debug = Object.assign({}, scaffold.__debug, { app: app });
    if (config.persistChat === false && TT.store.get('prefs', {}).saveChat == null) app.prefs.saveChat = false;
    app.loadPersisted({ watchlist: Array.isArray(config.watchlist) ? config.watchlist : mode === 'scaffold' ? TT.mock.data.defaultWatchlist : TT.KPI.map((k) => k[1]) });
    app.orbitalSite = config.defaultSite || (mode === 'scaffold' ? TT.mock.home.site : null);
    let demoSnapAtBoot = null;
    if (demo) {
      demoSnapAtBoot = { api: app.api, mode: mode, debug: window.TERRATERM.debug, site: app.orbitalSite };
      const dapi = TT.mock.createScaffold({ demo: true, config: config });
      app.api = wrap(dapi); app.mode = 'scaffold';
      window.TERRATERM.debug = Object.assign({}, dapi.__debug, { app: app });
      app.demo = { on: true, t0: Date.now(), beat: 1 };
      app.chat = []; app.acked = new Set(); app.pins = []; // in memory only; storage is left alone
      app.orbitalSite = TT.mock.home.site;
    }
    applyMotion();
    if (window.matchMedia) { const mq = window.matchMedia('(prefers-reduced-motion: reduce)'); if (mq.addEventListener) mq.addEventListener('change', applyMotion); }
    const root = document.getElementById('app');
    buildFrame(root);
    if (demo) { TT.demo.adopt(demoSnapAtBoot); shell.el.demoBadge.hidden = false; shell.el.demoSb.hidden = false; try { history.replaceState(null, '', '#/desk'); } catch (e) { /* noop */ } }
    TT.bus.on('system', renderSystem);
    TT.bus.on('feed', renderFeed);
    TT.bus.on('alerts', renderAlerts);
    TT.bus.on('quotes', TT.throttle(renderTape, 5000));
    TT.bus.on('tick', tickClock);
    tickClock(); renderFeed(); renderAlerts();
    router.init();
    app.start();
    root.setAttribute('aria-busy', 'false');
  };
})();
