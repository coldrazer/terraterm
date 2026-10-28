/* UI kit: panels, toasts, tooltips, overlay stack (modal, drawer, popover), pollers, keyboard roving. */
(function () {
  'use strict';
  const TT = window.TT;
  const H = TT.h;
  const ui = (TT.ui = {});

  /* ---------- overlay stack: Esc closes the top layer and restores focus ---------- */
  const layers = [];
  ui.pushLayer = function (layer) { layer.restore = layer.restore || document.activeElement; layers.push(layer); return layer; };
  ui.removeLayer = function (layer) { const i = layers.indexOf(layer); if (i >= 0) layers.splice(i, 1); };
  ui.closeTop = function () { const top = layers[layers.length - 1]; if (!top) return false; top.close(); return true; };
  ui.hasLayer = (kind) => layers.some((l) => !kind || l.kind === kind);
  ui.restoreFocus = function (el) { if (el && el.isConnected && typeof el.focus === 'function') { try { el.focus({ preventScroll: true }); } catch (e) { /* noop */ } } };

  /* ---------- panels ---------- */
  ui.panel = function (o) {
    const titleId = 'pt-' + o.id;
    const sub = H('span', { class: 'ps', text: o.sub || '' });
    const acts = H('div', { class: 'pa' }, o.actions || []);
    const head = H('header', { class: 'ph' }, H('h2', { class: 'pt', id: titleId, style: { margin: 0 } }, o.title), sub, acts);
    const ribbon = H('div', { class: 'ribbon', hidden: true, role: 'status' });
    const err = H('div', { class: 'panel-error', role: 'alert', hidden: true });
    const body = H('div', { class: 'pb' + (o.noscroll ? ' noscroll' : '') });
    const el = H('section', { class: 'panel ' + (o.cls || ''), id: 'panel-' + o.id, 'aria-labelledby': titleId, tabindex: '-1', dataset: { panel: o.id } }, head, ribbon, err, body);
    let retryFn = null;
    const api = {
      el: el, head: head, body: body, acts: acts,
      sub(text) { TT.setText(sub, text); sub.setAttribute('data-tip', text); },
      stale(ts) {
        if (ts == null) { ribbon.hidden = true; return; }
        ribbon.hidden = false; TT.setText(ribbon, ts ? 'STALE · LAST UPDATE ' + TT.fmt.utc(ts) : 'NO DATA YET · RETRYING');
      },
      error(msg, onRetry) {
        if (!msg) { err.hidden = true; return; }
        retryFn = onRetry;
        if (!err.firstChild || err.dataset.msg !== msg) {
          err.dataset.msg = msg;
          err.replaceChildren(H('span', { class: 'dot' }), H('span', { class: 'grow', text: msg }), onRetry ? H('button', { class: 'btn', type: 'button', onclick: () => retryFn && retryFn() }, 'RETRY') : null);
        }
        err.hidden = false;
      },
    };
    return api;
  };
  ui.section = function (title, sub, actions) {
    return H('div', { class: 'sh' }, H('h3', { class: 'pt', style: { margin: 0 } }, title), H('span', { class: 'ps', text: sub || '' }), actions ? H('div', { class: 'pa' }, actions) : null);
  };
  ui.empty = (text) => H('div', { class: 'empty', text: text });
  ui.skeletonRows = function (tbody, cols, rows) {
    tbody.replaceChildren();
    for (let r = 0; r < rows; r++) tbody.append(H('tr', { class: 'skel', 'aria-hidden': 'true' }, Array.from({ length: cols }, () => H('td', null, H('span', { style: { width: (40 + ((r * 7 + cols * 13) % 50)) + '%' } })))));
  };

  /* ---------- toasts: confirmations only (§6) ---------- */
  let toastRoot = null;
  const toasts = new Map();
  let toastSeq = 0;
  ui.toast = function (msg, opts) {
    opts = opts || {};
    if (!toastRoot) { toastRoot = H('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(toastRoot); }
    const id = opts.id || 't' + (++toastSeq);
    if (toasts.has(id)) ui.dismissToast(id);
    const el = H('div', { class: 'toast', dataset: { id: id } }, H('span', { class: 'msgtxt', text: msg }), opts.action ? H('button', { class: 'btn', type: 'button', onclick: () => { opts.action.run(); ui.dismissToast(id); } }, opts.action.label) : null);
    toastRoot.append(el);
    const timer = setTimeout(() => ui.dismissToast(id), opts.ms || 2600);
    toasts.set(id, { el: el, timer: timer });
    while (toastRoot.children.length > 3) { const first = toastRoot.firstElementChild; ui.dismissToast(first.dataset.id); }
    return id;
  };
  ui.dismissToast = function (id) { const t = toasts.get(id); if (!t) return; clearTimeout(t.timer); t.el.remove(); toasts.delete(id); };

  /* ---------- tooltip: full value + source for truncated text ---------- */
  const tip = H('div', { class: 'tip', role: 'tooltip', hidden: true, id: 'tt-tip' });
  let tipFor = null;
  function tipText(el) {
    if (el.dataset.tip) return { text: el.dataset.tip, src: el.dataset.src };
    if (el.classList.contains('trunc') && el.scrollWidth > el.clientWidth + 1) return { text: el.textContent, src: el.dataset.src };
    return null;
  }
  function showTip(el, x, y) {
    const t = tipText(el);
    if (!t || !t.text) return;
    if (!tip.isConnected) document.body.append(tip);
    tip.replaceChildren(document.createTextNode(t.text), t.src ? H('span', { class: 'src', text: t.src }) : null);
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = x != null ? x + 12 : r.left;
    let top = y != null ? y + 16 : r.bottom + 6;
    if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;
    if (top + th > window.innerHeight - 8) top = (y != null ? y : r.top) - th - 8;
    tip.style.left = Math.max(8, left) + 'px'; tip.style.top = Math.max(8, top) + 'px';
    tipFor = el;
  }
  ui.hideTip = function () { tip.hidden = true; tipFor = null; };
  ui.showTipAt = function (text, x, y, src) {
    if (!tip.isConnected) document.body.append(tip);
    tip.replaceChildren(document.createTextNode(text), src ? H('span', { class: 'src', text: src }) : null);
    tip.hidden = false;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = x + 14, top = y + 16;
    if (left + tw > window.innerWidth - 8) left = x - tw - 10;
    if (top + th > window.innerHeight - 8) top = y - th - 10;
    tip.style.left = Math.max(8, left) + 'px'; tip.style.top = Math.max(8, top) + 'px';
  };
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip], .trunc');
    if (el && el !== tipFor) showTip(el, e.clientX, e.clientY);
    else if (!el && tipFor) ui.hideTip();
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el && el.matches(':focus-visible')) showTip(el); else if (tipFor) ui.hideTip();
  });
  document.addEventListener('scroll', () => ui.hideTip(), true);

  /* ---------- modal (§6: centered, 480px max) ---------- */
  ui.modal = function (o) {
    const close = () => {
      ui.removeLayer(layer);
      scrim.remove();
      ui.restoreFocus(layer.restore);
      if (o.onClose) o.onClose();
    };
    const closeBtn = H('button', { class: 'btn btn-ghost', type: 'button', 'aria-label': 'Close', onclick: close }, 'ESC');
    const id = 'mdl-' + Math.random().toString(36).slice(2, 7);
    const box = H('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id }, H('header', { class: 'ph' }, H('h2', { class: 'pt', id: id, style: { margin: 0 } }, o.title), H('span', { class: 'ps' }), closeBtn), H('div', { class: 'modal-body' }, o.body));
    const scrim = H('div', { class: 'scrim center' }, box);
    scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) close(); });
    const layer = ui.pushLayer({ kind: 'modal', close: close, el: scrim });
    document.body.append(scrim);
    requestAnimationFrame(() => scrim.classList.add('open'));
    trapFocus(box);
    closeBtn.focus();
    return { close: close, el: box };
  };
  function trapFocus(root) {
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = TT.$$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', root).filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }
  ui.trapFocus = trapFocus;

  /* ---------- drawer (§6: from right) ---------- */
  let drawer = null;
  ui.drawer = function () { return drawer; };
  ui.openDrawer = function (o) {
    const host = document.getElementById('main');
    if (drawer && drawer.owner === o.owner && drawer.kind === o.kind) { drawer.render(o); return drawer; }
    if (drawer) drawer.close(true);
    const titleEl = H('h2', { class: 'pt trunc', style: { margin: 0 }, id: 'drawer-title' });
    const tagEl = H('span');
    const closeBtn = H('button', { class: 'btn btn-ghost', type: 'button', 'aria-label': 'Close drawer' }, 'ESC');
    const body = H('div', { class: 'drawer-body' });
    const acts = H('div', { class: 'drawer-acts' });
    const el = H('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'drawer-title', tabindex: '-1' }, H('header', { class: 'ph' }, tagEl, titleEl, H('span', { class: 'grow' }), closeBtn), body, acts);
    host.append(el);
    host.classList.add('drawer-open');
    const d = {
      el: el, body: body, acts: acts, owner: o.owner, kind: o.kind,
      render(opts) {
        d.owner = opts.owner; d.kind = opts.kind;
        titleEl.textContent = opts.title || ''; tagEl.replaceChildren(opts.tag || '');
        body.replaceChildren(); acts.replaceChildren();
        if (opts.render) opts.render(body, acts);
        d.onClose = opts.onClose;
      },
      close(silent) {
        if (drawer !== d) return;
        ui.removeLayer(layer);
        el.classList.remove('open');
        drawer = null;
        el.remove();
        host.classList.remove('drawer-open');
        if (!silent) ui.restoreFocus(layer.restore);
        if (d.onClose) d.onClose();
      },
    };
    closeBtn.addEventListener('click', () => d.close());
    const layer = ui.pushLayer({ kind: 'drawer', close: () => d.close(), el: el });
    d.render(o);
    drawer = d;
    requestAnimationFrame(() => { el.classList.add('open'); });
    if (o.focus !== false) el.focus({ preventScroll: true });
    return d;
  };
  ui.closeDrawer = function () { if (drawer) drawer.close(); };

  /* ---------- popover ---------- */
  ui.popover = function (container, x, y, content) {
    const el = H('div', { class: 'popover', role: 'dialog', tabindex: '-1' }, content, H('button', { class: 'btn', type: 'button', onclick: () => close() }, 'CLOSE'));
    container.append(el);
    const cw = container.clientWidth, ch = container.clientHeight;
    const pw = el.offsetWidth, ph = el.offsetHeight;
    el.style.left = TT.clamp(x - pw / 2, 8, Math.max(8, cw - pw - 8)) + 'px';
    el.style.top = TT.clamp(y + 14, 8, Math.max(8, ch - ph - 8)) + 'px';
    const onDoc = (e) => { if (!el.contains(e.target)) close(); };
    const close = () => { ui.removeLayer(layer); el.remove(); document.removeEventListener('mousedown', onDoc, true); ui.restoreFocus(layer.restore); };
    const layer = ui.pushLayer({ kind: 'popover', close: close, el: el });
    setTimeout(() => document.addEventListener('mousedown', onDoc, true), 0);
    el.focus();
    return { close: close, el: el };
  };

  /* ---------- poller with backoff ---------- */
  ui.Poller = class {
    constructor(name, fn, ms, hooks) {
      this.name = name; this.fn = fn; this.ms = ms; this.hooks = hooks || {};
      this.timer = null; this.fails = 0; this.running = false; this.busy = false; this.lastOk = null;
    }
    start() { if (this.running) return; this.running = true; this.tick(); }
    stop() { this.running = false; clearTimeout(this.timer); this.timer = null; }
    now() { clearTimeout(this.timer); this.timer = null; if (this.busy) { this.again = true; return Promise.resolve(); } return this.tick(); }
    schedule(ms) { clearTimeout(this.timer); if (this.running) this.timer = setTimeout(() => this.tick(), ms); }
    async tick() {
      if (this.busy) return;
      this.busy = true;
      try {
        const data = await this.fn();
        const wasDown = this.fails > 0;
        this.fails = 0; this.lastOk = Date.now();
        if (this.hooks.onData) this.hooks.onData(data);
        if (wasDown && this.hooks.onRecover) this.hooks.onRecover();
        this.busy = false;
        if (this.again) { this.again = false; return this.tick(); }
        this.schedule(document.hidden ? this.ms * 4 : this.ms);
      } catch (err) {
        if (err && !/^(Feed|Agent|HTTP|Failed to fetch|NetworkError|Browser offline)/.test(err.message || '')) console.error('[TERRATERM] ' + this.name + ' poll failed:', err);
        this.fails++;
        this.busy = false;
        const wantAgain = this.again;
        this.again = false;
        if (this.hooks.onError) this.hooks.onError(err, this.fails);
        this.schedule(wantAgain ? 0 : Math.min(15000, 1000 * Math.pow(2, this.fails - 1)));
      }
    }
  };

  /* ---------- roving focus for row lists ---------- */
  ui.roving = function (container, selector, hooks) {
    hooks = hooks || {};
    container.addEventListener('keydown', (e) => {
      const row = e.target.closest(selector);
      if (!row || !container.contains(row)) return;
      const rows = TT.$$(selector, container).filter((r) => r.offsetParent !== null);
      const i = rows.indexOf(row);
      let next = null;
      if (e.key === 'ArrowDown') next = rows[Math.min(rows.length - 1, i + 1)];
      else if (e.key === 'ArrowUp') next = rows[Math.max(0, i - 1)];
      else if (e.key === 'Home') next = rows[0];
      else if (e.key === 'End') next = rows[rows.length - 1];
      else if (e.key === 'PageDown') next = rows[Math.min(rows.length - 1, i + 10)];
      else if (e.key === 'PageUp') next = rows[Math.max(0, i - 10)];
      else if ((e.key === 'Enter' || e.key === ' ') && hooks.onEnter && e.target === row) { e.preventDefault(); hooks.onEnter(row, e); return; }
      else if (hooks.onKey) { hooks.onKey(e, row); return; }
      if (next) { e.preventDefault(); rows.forEach((r) => r.setAttribute('tabindex', '-1')); next.setAttribute('tabindex', '0'); next.focus(); next.scrollIntoView({ block: 'nearest' }); }
    });
  };
  ui.rovingReset = function (container, selector) {
    const rows = TT.$$(selector, container);
    if (!rows.length) return;
    if (!rows.some((r) => r.getAttribute('tabindex') === '0')) rows[0].setAttribute('tabindex', '0');
  };

  /* ---------- flash a cell for 400ms (§14) ---------- */
  ui.flash = function (cell, dir) {
    if (!cell || TT.motionReduced() || !dir) return;
    // The flash is a static background, so no reflow is needed to restart it (a forced reflow per cell froze large tables).
    cell.classList.toggle('flash-up', dir > 0);
    cell.classList.toggle('flash-down', dir < 0);
    clearTimeout(cell._ft);
    cell._ft = setTimeout(() => cell.classList.remove('flash-up', 'flash-down'), 400);
  };
})();
