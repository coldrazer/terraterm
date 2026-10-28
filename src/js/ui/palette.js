/* Command palette (`/`) with fuzzy search over views, sites, segments, symbols and actions, and the shortcut sheet (`?`). */
(function () {
  'use strict';
  const TT = window.TT;
  const H = TT.h;
  const app = () => TT.app;
  TT.VIEWS = [
    { id: 'macro', key: 'F1', label: 'Macro dashboard', kw: 'kpi chart timeframe' },
    { id: 'orbital', key: 'F2', label: 'Orbital intelligence', kw: 'imagery satellite segments passes' },
    { id: 'agent', key: 'F3', label: 'Agent', kw: 'chat ask brief' },
    { id: 'flow', key: 'F4', label: 'Capital flow', kw: 'flows usd' },
    { id: 'commodities', key: 'F5', label: 'Commodities', kw: 'futures table' },
    { id: 'fx', key: 'F6', label: 'FX', kw: 'currencies table' },
    { id: 'intel', key: 'F7', label: 'Satellite intel', kw: 'sites mission control' },
    { id: 'alerts', key: 'F8', label: 'Alerts', kw: 'inbox rules' },
  ];

  function items(q) {
    const out = [];
    out.push({ group: 'Views', label: 'Desk', sub: 'six-panel home', key: 'Alt+0', kw: 'home', run: () => TT.router.go('desk') });
    TT.VIEWS.forEach((v, k) => out.push({ group: 'Views', label: v.label, sub: v.key, key: String(k + 1), kw: v.kw + ' ' + v.id, run: () => TT.router.go(v.id) }));
    const sites = app().sites.length ? app().sites : [];
    sites.forEach((s) => out.push({ group: 'Sites', label: s.name, sub: s.type + ' · ' + s.region, kw: s.id + ' ' + s.short, run: () => TT.router.go('orbital/' + s.id) }));
    const segSeen = new Set();
    sites.forEach((s) => {
      app().imgCache.forEach((p, key) => {
        if (key.indexOf(s.id + ':') !== 0 || !p._res) return;
        p._res.pass.segments.filter((g) => g.hud).forEach((g) => { const id = s.id + '/' + g.id; if (segSeen.has(id)) return; segSeen.add(id); out.push({ group: 'Segments', label: g.label.split(' · ')[0] + ' · ' + s.short, sub: g.cls + ' · conf ' + TT.fmt.conf(g.conf), kw: g.id, run: () => TT.router.go('orbital/' + id) }); });
      });
      const id = s.id + '/' + s.key;
      if (!segSeen.has(id)) { segSeen.add(id); out.push({ group: 'Segments', label: s.keyLabel + ' · ' + s.short, sub: s.keyMetric.name + ' ' + TT.metricText(s.keyMetric), kw: s.key, run: () => TT.router.go('orbital/' + id) }); }
    });
    const symSeen = new Set();
    app().quotes.forEach((qv, sym) => { symSeen.add(sym); out.push({ group: 'Symbols', label: sym, sub: qv.name, kw: qv.name, run: () => { app().togglePin({ kind: 'symbol', id: sym, label: sym }); TT.ui.toast((app().isPinned('symbol', sym) ? 'Pinned ' : 'Unpinned ') + sym + (app().isPinned('symbol', sym) ? ' to agent context.' : ' from agent context.')); } }); });
    ['commodities', 'fx'].forEach((kind) => {
      const v = TT.views[kind];
      if (v && v.data) v.data.forEach((qv, sym) => { if (symSeen.has(sym)) return; symSeen.add(sym); out.push({ group: 'Symbols', label: sym, sub: qv.name, kw: qv.name, run: () => TT.router.go(kind + '/' + sym) }); });
    });
    const scaffold = app().mode === 'scaffold';
    const actions = [
      { label: 'Show keyboard shortcuts', key: '?', run: () => TT.shortcuts() },
      { label: (app().prefs.tape ? 'Hide' : 'Show') + ' ticker tape', key: 'T', run: () => TT.shell.toggleTape() },
      { label: 'Reset desk layout', run: () => TT.views.desk.layout.reset() },
      { label: 'Acknowledge all alerts', run: () => app().ackAll() },
      { label: 'Clear agent conversation', run: () => { app().clearChat(); TT.ui.toast('Conversation cleared.'); } },
      { label: (TT.motionReduced() ? 'Allow' : 'Reduce') + ' motion', run: () => TT.shell.toggleMotion() },
      { label: app().prefs.saveChat === false ? 'Save agent conversation on this device' : 'Stop saving agent conversation on this device', kw: 'privacy storage history chat', run: () => app().setSaveChat(app().prefs.saveChat === false) },
    ];
    if (TT.demoAllowed()) actions.push({ label: app().demo.on ? 'Exit demo mode' : 'Start demo mode (90 second run)', kw: 'demo judge present', run: () => (app().demo.on ? TT.demo.exit() : TT.demo.start()) });
    if (app().demo.on) actions.push({ label: 'Demo: next beat', key: 'N', run: () => TT.demo.next() });
    if (scaffold) {
      actions.push({ label: app().feed.status === 'down' ? 'Restore feed (scaffold)' : 'Simulate feed outage (scaffold)', kw: 'offline stale test', run: () => { window.TERRATERM.debug.feed(app().feed.status === 'down'); app().retryFeed(); } });
      actions.push({ label: 'Clear saved layout, pins and chat', kw: 'storage reset', run: () => { TT.store.clear(); TT.ui.toast('Saved state cleared. Reload to start fresh.'); } });
    }
    actions.forEach((a) => out.push(Object.assign({ group: 'Actions' }, a)));
    const query = (q || '').trim();
    if (!query) return out.filter((i) => i.group === 'Views' || i.group === 'Actions' || i.group === 'Sites');
    const ranked = out.map((i) => ({ i: i, s: Math.max(TT.fuzzy(query, i.label), TT.fuzzy(query, i.kw || '') - 40, TT.fuzzy(query, i.sub || '') - 80) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 40).map((x) => x.i);
    ranked.push({ group: 'Agent', label: 'Ask TERRATERM: ' + query, run: () => { TT.router.go(TT.router.current.view === 'desk' ? 'desk' : 'agent'); app().ask(query); } });
    return ranked;
  }

  let state = null;
  TT.palette = {
    isOpen: () => !!state,
    open(initial) {
      if (state) { state.input.focus(); return; }
      const input = H('input', { class: 'input', id: 'palette-input', type: 'text', autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'palette-list', 'aria-autocomplete': 'list', 'aria-label': 'Command', placeholder: 'Jump to a view, site, segment or symbol. Or ask the agent.' });
      const list = H('ul', { class: 'pal-list', id: 'palette-list', role: 'listbox', 'aria-label': 'Results' });
      const foot = H('div', { class: 'pal-foot' }, H('span', null, H('kbd', null, '↑↓'), ' move'), H('span', null, H('kbd', null, 'Enter'), ' select'), H('span', null, H('kbd', null, '1'), '–', H('kbd', null, '8'), ' views'), H('span', null, H('kbd', null, 'Esc'), ' close'));
      const box = H('div', { class: 'palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Command palette' }, input, list, foot);
      const scrim = H('div', { class: 'scrim' }, box);
      scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) TT.palette.close(); });
      document.body.append(scrim);
      requestAnimationFrame(() => scrim.classList.add('open'));
      const layer = TT.ui.pushLayer({ kind: 'palette', close: () => TT.palette.close() });
      state = { input: input, list: list, scrim: scrim, layer: layer, idx: 0, results: [] };
      const render = () => {
        state.results = items(input.value);
        state.idx = TT.clamp(state.idx, 0, Math.max(0, state.results.length - 1));
        let last = '';
        const kids = [];
        state.results.forEach((it, k) => {
          if (it.group !== last) { kids.push(H('li', { class: 'pal-group', role: 'presentation' }, it.group)); last = it.group; }
          const li = H('li', { class: 'pal-item', role: 'option', id: 'pal-opt-' + k, 'aria-selected': k === state.idx ? 'true' : 'false', dataset: { k: String(k) } },
            H('span', { class: 'ic', 'aria-hidden': 'true' }, it.group === 'Views' ? '▦' : it.group === 'Sites' ? '◎' : it.group === 'Segments' ? '▢' : it.group === 'Symbols' ? '$' : it.group === 'Agent' ? '›' : '•'),
            H('span', { class: 'lbl' }, it.label), it.sub ? H('span', { class: 'sub' }, it.sub) : null, it.key ? H('kbd', null, it.key) : null);
          li.addEventListener('mousemove', () => { if (state.idx !== k) { state.idx = k; mark(); } });
          li.addEventListener('click', () => run(k));
          kids.push(li);
        });
        list.replaceChildren.apply(list, kids);
        mark();
      };
      const mark = () => {
        TT.$$('.pal-item', list).forEach((li) => li.setAttribute('aria-selected', Number(li.dataset.k) === state.idx ? 'true' : 'false'));
        const cur = list.querySelector('#pal-opt-' + state.idx);
        input.setAttribute('aria-activedescendant', cur ? cur.id : '');
        if (cur) cur.scrollIntoView({ block: 'nearest' });
      };
      const run = (k) => { const it = state.results[k]; if (!it) return; TT.palette.close(true); it.run(); };
      state.run = run;
      input.addEventListener('input', () => { state.idx = 0; render(); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); state.idx = Math.min(state.results.length - 1, state.idx + 1); mark(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); state.idx = Math.max(0, state.idx - 1); mark(); }
        else if (e.key === 'Enter') { e.preventDefault(); run(state.idx); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); TT.palette.close(); }
        else if (/^[1-8]$/.test(e.key) && !input.value) { e.preventDefault(); TT.palette.close(true); TT.router.go(TT.VIEWS[Number(e.key) - 1].id); }
        else if (e.key === 'Tab') { e.preventDefault(); }
      });
      if (initial) input.value = initial;
      render();
      input.focus();
    },
    close(navigating) {
      if (!state) return;
      const s = state; state = null;
      TT.ui.removeLayer(s.layer);
      s.scrim.remove();
      if (!navigating) TT.ui.restoreFocus(s.layer.restore);
    },
    type(text) { if (!state) this.open(); state.input.value = text; state.input.dispatchEvent(new Event('input')); },
    runFirst() { if (state) state.run(0); },
  };

  TT.shortcuts = function () {
    const row = (k, d) => [H('dt', null, k), H('dd', null, d)];
    const kb = (...ks) => ks.map((k, i) => [i ? ' ' : '', H('kbd', null, k)]);
    const body = H('dl', { class: 'keys' },
      H('h3', null, 'Navigate'),
      row(kb('F1', '–', 'F8'), 'Macro, Orbital, Agent, Flow, Commodities, FX, Satellite intel, Alerts'),
      row(kb('Alt', '1', '–', '8'), 'Same views, for browsers that keep a function key'),
      row(kb('Alt', '0'), 'Desk'),
      row(kb('/'), 'Command palette: views, sites, segments, symbols, actions'),
      row(kb('?'), 'This sheet'),
      row(kb('Esc'), 'Close the top layer, stop the agent, or return to the last panel'),
      H('h3', null, 'Agent'),
      row(kb('A'), 'Focus the ask box'),
      row(kb('↑'), 'Recall the previous prompt'),
      row(kb('Enter'), 'Send'),
      H('h3', null, 'Orbital'),
      row(kb('[', ']'), 'Previous or next pass'),
      row(kb('P'), 'Play or stop the pass loop'),
      row(kb('C'), 'Compare with the prior pass'),
      row(kb('L'), 'Show or hide HUD labels'),
      H('h3', null, 'Tables and lists'),
      row(kb('↑', '↓'), 'Move between rows'),
      row(kb('Enter'), 'Open row detail, or pin a watchlist row to agent context'),
      row(kb('P'), 'Pin or unpin the row to the watchlist'),
      row(kb('Del'), 'Remove a watchlist row'),
      H('h3', null, 'Desk'),
      row(kb('Alt', 'Shift', '←↑→↓'), 'Move the focused panel'),
      row(kb('T'), 'Ticker tape on or off'),
      TT.demoAllowed() ? row(kb('N'), 'Demo mode: run the next beat') : null);
    TT.ui.modal({ title: 'KEYBOARD', body: body });
  };
})();
