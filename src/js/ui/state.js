/* App state and data layer. Polls the contract, keeps derived state, and broadcasts changes on TT.bus. */
(function () {
  'use strict';
  const TT = window.TT;
  const bus = TT.bus;
  const STALE_MS = 15 * 60000;

  const app = (TT.app = {
    api: null, mode: 'scaffold', config: {}, fallbacks: [],
    quotes: new Map(), quotesAsOf: null, quotesSource: '',
    watch: [], pins: [], alerts: [], acked: new Set(), timeline: [], chat: [],
    wire: [], wireAsOf: null, wireSource: '',
    sites: [], sitesAsOf: null, system: null, systemAsOf: null, flow: null, flowAsOf: null,
    feed: { status: 'live', lastOk: null, error: null },
    prefs: { saveChat: true, tape: false, motion: 'auto', minConf: 0.8, flowMode: 'abs', tf: '1D', wireTag: 'all', wireSym: 'all', series: null },
    rules: [], imgCache: new Map(), lastEventSeq: 0, asking: null, deferred: [],
    selected: null, orbitalSite: null, demo: { on: false, t0: 0, beat: 0 },
    pollers: {}, down: {},
  });

  /* ---------- persistence ---------- */
  app.loadPersisted = function (defaults) {
    app.watch = TT.store.get('watch', defaults.watchlist.slice());
    app.pins = TT.store.get('pins', []);
    Object.assign(app.prefs, TT.store.get('prefs', {}));
    app.acked = new Set(TT.store.get('acked', []));
    app.chat = app.prefs.saveChat === false ? [] : TT.store.get('chat', []).filter((m) => !m.streaming);
    app.rules = TT.store.get('rules', [{ id: 'r1', sym: 'CL1', metric: 'chgPct', op: '>', threshold: 3, channel: 'both', armed: true }]);
  };
  const DEMO_EPHEMERAL = ['pins', 'chat', 'acked', 'watch', 'rules'];
  app.save = function (what) {
    if (app.demo.on && DEMO_EPHEMERAL.indexOf(what) >= 0) return; // demo runs never touch the user's saved state
    if (what === 'watch') TT.store.set('watch', app.watch);
    else if (what === 'pins') TT.store.set('pins', app.pins);
    else if (what === 'prefs') TT.store.set('prefs', app.prefs);
    else if (what === 'acked') TT.store.set('acked', Array.from(app.acked).slice(-1000));
    else if (what === 'chat') { if (app.prefs.saveChat === false) TT.store.del('chat'); else TT.store.set('chat', app.chat.filter((m) => !m.streaming).slice(-40)); }
    else if (what === 'rules') TT.store.set('rules', app.rules);
  };
  app.setPref = function (k, v) { app.prefs[k] = v; app.save('prefs'); bus.emit('prefs', { key: k, value: v }); };

  /* ---------- feed health ---------- */
  function feedOk() {
    if (app.feed.status !== 'live') {
      app.feed.status = 'live'; app.feed.error = null;
      bus.emit('feed', app.feed);
      TT.ui.toast('Feed reconnected.');
    }
    app.feed.lastOk = Date.now();
  }
  function feedDown(err) {
    app.feed.error = (err && err.message) || 'Feed disconnected';
    if (app.feed.status !== 'down') { app.feed.status = 'down'; bus.emit('feed', app.feed); }
  }
  app.isStale = function (asOf) { return app.feed.status === 'down' || (asOf != null && Date.now() - asOf > STALE_MS); };
  app.lastOk = (name) => (app.pollers[name] && app.pollers[name].lastOk) || 0;
  app.retryFeed = function () { Object.values(app.pollers).forEach((p) => p.now()); };

  /* ---------- quotes ---------- */
  function onQuotes(res) {
    const changed = [];
    res.quotes.forEach((q) => {
      const prev = app.quotes.get(q.sym);
      if (prev && prev.px !== q.px) changed.push({ sym: q.sym, dir: q.px > prev.px ? 1 : -1 });
      app.quotes.set(q.sym, q);
    });
    app.quotesAsOf = res.asOf; app.quotesSource = res.source || 'feed';
    feedOk();
    bus.emit('quotes', { changed: changed });
    evalRules(res.quotes);
  }

  /* ---------- events, alerts, timeline ---------- */
  let firstEvents = true;
  function onEvents(res) {
    (res.events || []).forEach((ev) => {
      app.lastEventSeq = Math.max(app.lastEventSeq, ev.seq || 0);
      handleEvent(ev, firstEvents);
    });
    firstEvents = false;
  }
  function handleEvent(ev, initial) {
    if (ev.type === 'alert') addAlert(ev, initial);
    else addTimeline({ id: 'ev' + ev.seq, ts: ev.ts, type: ev.type, text: ev.text, route: ev.route });
  }
  function addTimeline(item) {
    if (app.timeline.some((t) => t.id === item.id)) return;
    app.timeline.push(item);
    app.timeline.sort((a, b) => b.ts - a.ts);
    if (app.timeline.length > 120) app.timeline.length = 120;
    bus.emit('timeline', item);
  }
  app.addTimeline = addTimeline;
  function addAlert(ev, initial) {
    if (app.alerts.some((a) => a.id === ev.id)) return;
    const a = { id: ev.id, sev: ev.sev || 'med', subject: ev.subject, message: ev.message, ts: ev.ts, route: ev.route, site: ev.site, segId: ev.segId, conf: ev.conf, source: ev.source || 'detector', acked: app.acked.has(ev.id) };
    app.alerts.unshift(a);
    app.alerts.sort((x, y) => y.ts - x.ts);
    if (app.alerts.length > 500) { // keep every open alert, then the newest acknowledged ones
      const open = app.alerts.filter((x) => !x.acked).length;
      let room = Math.max(0, 500 - open);
      app.alerts = app.alerts.filter((x) => !x.acked || room-- > 0);
    }
    addTimeline({ id: 'al-' + a.id, ts: a.ts, type: 'alert', sev: a.sev, text: a.subject + ' · ' + a.message, route: a.route });
    if (!initial && !a.acked) {
      if (ev.channel !== 'agent') TT.ui.toast('ALERT · ' + a.subject + ' · ' + a.message, { id: 'alert-' + a.id, ms: 2600, action: a.route ? { label: 'VIEW', run: () => TT.router.go(a.route) } : null });
      if (ev.proactive || ev.channel === 'agent' || ev.channel === 'both') {
        app.systemMessage({ text: a.subject + ': ' + a.message + (a.conf ? ' · confidence ' + TT.fmt.conf(a.conf) : ''), route: a.route, alertId: a.id, sev: a.sev });
      }
    }
    bus.emit('alerts', { added: a, initial: initial });
  }
  app.activeAlerts = () => app.alerts.filter((a) => !a.acked);
  app.ack = function (id) {
    const a = app.alerts.find((x) => x.id === id);
    if (!a || a.acked) return;
    a.acked = true; app.acked.add(id); app.save('acked');
    TT.ui.dismissToast('alert-' + id);
    addTimeline({ id: 'ack-' + id, ts: Date.now(), type: 'ack', text: 'Acknowledged · ' + a.subject, route: a.route });
    bus.emit('alerts', { acked: a });
  };
  app.ackAll = function () { const n = app.activeAlerts().length; app.activeAlerts().forEach((a) => app.ack(a.id)); if (n) TT.ui.toast(n + ' alert' + (n > 1 ? 's' : '') + ' acknowledged.'); };

  /* ---------- rules builder (v0.2) ---------- */
  function evalRules(quotes) {
    let dirty = false;
    app.rules.forEach((r) => {
      const q = quotes.find((x) => x.sym === r.sym) || app.quotes.get(r.sym);
      if (!q) return;
      const v = r.metric === 'chgPct' ? (q.kind === 'yield' ? q.chg * 100 : q.chgPct * 100) : q.px;
      const hit = r.op === '>' ? v > r.threshold : v < r.threshold;
      if (hit && r.armed) {
        r.armed = false; dirty = true;
        const unit = r.metric === 'chgPct' ? (q.kind === 'yield' ? ' bp' : '%') : '';
        addAlert({ id: 'rule-' + r.id + '-' + Date.now(), sev: 'med', subject: r.sym + ' · RULE', message: (r.metric === 'chgPct' ? 'Change ' : 'Last ') + TT.fmt.num(v, 2) + unit + ' ' + r.op + ' ' + r.threshold + unit,
          ts: Date.now(), route: 'macro', source: 'rule', channel: r.channel, proactive: r.channel !== 'toast' }, false);
      } else if (!hit && !r.armed) { r.armed = true; dirty = true; }
    });
    if (dirty) { app.save('rules'); bus.emit('rules'); }
  }
  app.addRule = function (r) { r.id = 'r' + Date.now().toString(36); r.armed = true; app.rules.push(r); app.save('rules'); bus.emit('rules'); TT.ui.toast('Rule added: ' + r.sym + ' ' + r.op + ' ' + r.threshold + '.'); };
  app.removeRule = function (id) { app.rules = app.rules.filter((r) => r.id !== id); app.save('rules'); bus.emit('rules'); TT.ui.toast('Rule removed.'); };

  /* ---------- wire, sites, system, flow ---------- */
  function onWire(res) {
    const fresh = app.wire.length ? res.items.filter((i) => !app.wire.some((w) => w.id === i.id)).map((i) => i.id) : [];
    app.wire = res.items; app.wireAsOf = res.asOf; app.wireSource = res.source || 'wire';
    bus.emit('wire', { fresh: fresh });
  }
  const sitesWarned = new Set();
  function onSites(res) {
    res.sites.forEach((s) => {
      if (!Number.isFinite(s.latestPass) && !sitesWarned.has(s.id)) { sitesWarned.add(s.id); console.warn('[TERRATERM] sites() entry "' + s.id + '" has no numeric latestPass; new passes for it are picked up on reload. See CONTRACT.md.'); }
      const c = app.imgCache.get(s.id + ':latest'); if (c && c._res && s.latestPass > c._res.pass.ts) app.imgCache.delete(s.id + ':latest');
    });
    app.sites = res.sites; app.sitesAsOf = res.asOf; bus.emit('sites');
  }
  // system() is optional and loosely shaped in the wild: normalize it once so every renderer can trust it.
  function onSystem(res) {
    const s = Object.assign({}, res || {});
    s.models = Array.isArray(s.models) ? s.models.filter((m) => m && typeof m === 'object' && m.name != null) : [];
    s.context = s.context && Number.isFinite(s.context.used) && Number.isFinite(s.context.max) && s.context.max > 0 ? s.context : null;
    app.system = s; app.systemAsOf = s.asOf; bus.emit('system');
  }
  function onFlow(res) { app.flow = res; app.flowAsOf = res.asOf; bus.emit('flow'); }

  /* ---------- watchlist and agent context pins ---------- */
  app.isWatched = (sym) => app.watch.indexOf(sym) >= 0;
  app.toggleWatch = function (sym, on) {
    const has = app.isWatched(sym);
    const want = on == null ? !has : on;
    if (want === has) return;
    if (want) app.watch.push(sym); else app.watch = app.watch.filter((s) => s !== sym);
    app.save('watch');
    bus.emit('watch', { sym: sym, on: want });
    TT.ui.toast((want ? 'Pinned ' : 'Unpinned ') + sym + (want ? ' to watchlist.' : ' from watchlist.'));
    if (app.pollers.quotes) app.pollers.quotes.now();
  };
  app.isPinned = (kind, id, site) => app.pins.some((p) => p.kind === kind && p.id === id && (kind !== 'segment' || p.site === site));
  app.togglePin = function (pin) {
    const i = app.pins.findIndex((p) => p.kind === pin.kind && p.id === pin.id && p.site === pin.site);
    if (i >= 0) app.pins.splice(i, 1); else app.pins.push(pin);
    if (app.pins.length > 8) app.pins.shift();
    app.save('pins');
    bus.emit('pins');
  };

  /* ---------- agent ---------- */
  let pendingEmit = new Set(), raf = 0;
  function emitUpdate(msg) {
    pendingEmit.add(msg);
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; const list = Array.from(pendingEmit); pendingEmit.clear(); list.forEach((m) => bus.emit('chat', { type: 'update', msg: m })); });
  }
  const mid = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  app.contextSnapshot = function () {
    const route = TT.router ? TT.router.current : null;
    return {
      view: route ? route.view : 'desk',
      pins: app.pins.slice(),
      quotes: app.pins.filter((p) => p.kind === 'symbol').map((p) => app.quotes.get(p.id)).filter(Boolean),
      site: app.orbitalSite,
      segment: app.selected ? { site: app.selected.site, id: app.selected.id, pass: app.selected.pass } : null,
    };
  };
  app.ask = async function (prompt) {
    prompt = String(prompt || '').trim();
    if (!prompt) return;
    if (app.asking) { TT.ui.toast('The agent is still answering. Press Esc to stop it.'); return; }
    const user = { id: mid(), role: 'user', text: prompt, ts: Date.now() };
    const msg = { id: mid(), role: 'agent', text: '', ts: Date.now(), model: TT.labels.agentModel(), streaming: true, reasoning: true, prompt: prompt };
    app.chat.push(user, msg);
    bus.emit('chat', { type: 'add', msg: user });
    bus.emit('chat', { type: 'add', msg: msg });
    const controller = new AbortController();
    app.asking = { controller: controller, id: msg.id };
    bus.emit('asking', true);
    try {
      const res = await app.api.ask({
        prompt: prompt, context: app.contextSnapshot(), signal: controller.signal,
        onToken: (chunk, acc) => { msg.reasoning = false; msg.text = acc != null ? acc : msg.text + chunk; emitUpdate(msg); },
      });
      msg.text = res.text; msg.sources = res.sources || []; msg.confidence = res.confidence; msg.missing = res.missing || []; msg.model = res.model || msg.model;
      addTimeline({ id: 'brief-' + msg.id, ts: Date.now(), type: 'agent', text: 'Agent answered: ' + prompt.slice(0, 60) + (prompt.length > 60 ? '…' : ''), route: 'agent' });
    } catch (err) {
      if (err && err.name === 'AbortError') { msg.stopped = true; }
      else { msg.error = 'The agent did not respond. ' + ((err && err.message) || ''); }
    } finally {
      msg.streaming = false; msg.reasoning = false;
      app.asking = null;
      emitUpdate(msg);
      bus.emit('asking', false);
      app.save('chat');
      const q = app.deferred.splice(0);
      q.forEach((m) => app.systemMessage(m));
      if (app.pollers.system) app.pollers.system.now();
    }
  };
  app.stopAsk = function () { if (app.asking) { app.asking.controller.abort(); return true; } return false; };
  app.retryAsk = function (msgId) {
    if (app.asking) { TT.ui.toast('The agent is still answering. Press Esc to stop it.'); return; }
    const i = app.chat.findIndex((m) => m.id === msgId);
    if (i < 0 || !app.chat[i].prompt) return;
    const prompt = app.chat[i].prompt;
    let u = -1;
    for (let k = i - 1; k >= 0; k--) {
      if (app.chat[k].role === 'user' && app.chat[k].text === prompt) { u = k; break; }
      if (app.chat[k].role === 'agent') break;
    }
    app.chat.splice(i, 1);
    if (u >= 0) app.chat.splice(u, 1);
    bus.emit('chat', { type: 'reset' });
    app.ask(prompt);
  };
  app.systemMessage = function (m) {
    if (app.asking) { app.deferred.push(m); return; }
    const msg = { id: mid(), role: 'system', text: m.text, ts: Date.now(), route: m.route, alertId: m.alertId, sev: m.sev };
    app.chat.push(msg);
    bus.emit('chat', { type: 'add', msg: msg });
    app.save('chat');
  };
  app.setSaveChat = function (on) {
    app.setPref('saveChat', !!on);
    app.save('chat');
    TT.ui.toast(on ? 'Conversation will be saved on this device.' : 'Conversation is no longer saved on this device. Saved copy deleted.');
  };
  app.clearChat = function () { app.chat = []; app.save('chat'); bus.emit('chat', { type: 'reset' }); };

  /* ---------- imagery with a per-session cache ---------- */
  // Entries are keyed by site and pass index. A backend may serve a rolling window (index 0 = oldest pass kept),
  // so every response's pass list is checked against what is cached and entries whose index now names a
  // different pass are dropped. The cache is bounded so long live sessions do not keep every image forever.
  const IMG_CACHE_MAX = 120;
  function reconcile(site, passes) {
    if (!Array.isArray(passes)) return;
    app.imgCache.forEach((p, key) => {
      if (key.indexOf(site + ':') !== 0 || key === site + ':latest' || !p._res) return;
      const i = Number(key.slice(site.length + 1));
      const meta = passes.find((m) => Number(m.i) === i);
      if (!meta || meta.id !== p._res.pass.id) app.imgCache.delete(key);
    });
  }
  function trimImgCache() {
    if (app.imgCache.size <= IMG_CACHE_MAX) return;
    for (const key of app.imgCache.keys()) {
      if (app.imgCache.size <= IMG_CACHE_MAX) break;
      if (!/:latest$/.test(key)) app.imgCache.delete(key);
    }
  }
  app.imagery = function (site, pass) {
    const key = site + ':' + (pass == null ? 'latest' : pass);
    const hit = app.imgCache.get(key);
    if (hit && (pass != null || Date.now() - hit._at < 60000)) return hit;
    const p = app.api.imagery({ site: site, pass: pass }).then((res) => {
      reconcile(site, res.passes);
      const idxKey = site + ':' + res.pass.i;
      if (idxKey !== key) { const q = Promise.resolve(res); q._res = res; q._at = Date.now(); app.imgCache.set(idxKey, q); }
      p._res = res;
      trimImgCache();
      return res;
    });
    p.catch(() => { if (app.imgCache.get(key) === p) app.imgCache.delete(key); });
    p._at = Date.now();
    app.imgCache.set(key, p);
    return p;
  };
  app.allPasses = async function (site, last) {
    const first = await app.imagery(site);
    const list = last ? first.passes.slice(-last) : first.passes;
    return Promise.all(list.map((p) => app.imagery(site, p.i)));
  };

  /* ---------- reset (demo mode) ---------- */
  app.resetData = function (api) {
    Object.values(app.pollers).forEach((p) => p.stop());
    app.pollers = {};
    if (app.asking) app.stopAsk();
    app.api = api;
    app.quotes.clear(); app.quotesAsOf = null;
    app.alerts = []; app.acked = new Set(); app.down = {};
    app.timeline = []; app.wire = []; app.lastEventSeq = 0; firstEvents = true;
    app.imgCache.clear(); app.selected = null; app.pins = [];
    app.chat = []; app.deferred = [];
    app.feed = { status: 'live', lastOk: null, error: null };
    bus.emit('chat', { type: 'reset' }); bus.emit('timeline', {}); bus.emit('alerts', {}); bus.emit('pins'); bus.emit('wire', { fresh: [] }); bus.emit('feed', app.feed);
    app.start(true);
  };

  /* Restore pins, conversation and acknowledgements from storage (used when demo mode ends). */
  app.restorePersisted = function () {
    app.pins = TT.store.get('pins', []);
    app.watch = TT.store.get('watch', app.watch);
    app.rules = TT.store.get('rules', app.rules);
    app.acked = new Set(TT.store.get('acked', []));
    app.chat = app.prefs.saveChat === false ? [] : TT.store.get('chat', []).filter((m) => !m.streaming);
    bus.emit('chat', { type: 'reset' }); bus.emit('pins'); bus.emit('alerts', {}); bus.emit('watch', {}); bus.emit('rules');
  };

  /* ---------- boot ---------- */
  app.start = function (restart) {
    const api = app.api;
    const P = TT.ui.Poller;
    app.pollers.quotes = new P('quotes', () => api.watchlist({ symbols: Array.from(new Set(app.watch.concat((TT.KPI || []).map((k) => k[1])))) }), 1000, { onData: onQuotes, onError: feedDown });
    // Optional feeds report their own health so a panel can show it is stale instead of failing silently.
    const opt = (name, fn, ms, onData) => new P(name, fn, ms, {
      onData: (r) => { if (app.down[name]) { delete app.down[name]; bus.emit('health', name); } onData(r); },
      onError: (err) => { if (!app.down[name]) { app.down[name] = (err && err.message) || 'unavailable'; bus.emit('health', name); } },
    });
    if (api.events) app.pollers.events = opt('events', () => api.events({ since: app.lastEventSeq }), 2000, onEvents);
    if (api.wire) app.pollers.wire = opt('wire', () => api.wire(), 5000, onWire);
    if (api.system) app.pollers.system = opt('system', () => api.system(), 3000, onSystem);
    if (api.flow) app.pollers.flow = opt('flow', () => api.flow(), 30000, onFlow);
    if (api.sites) app.pollers.sites = opt('sites', () => api.sites(), 15000, onSites);
    Object.values(app.pollers).forEach((p) => p.start());
    if (restart) return;
    setInterval(() => bus.emit('tick', Date.now()), 1000);
    if (app.mode === 'live') {
      window.addEventListener('offline', () => feedDown(new Error('Browser offline')));
      window.addEventListener('online', () => app.retryFeed());
    }
  };
})();
