/* Orbital viewer (§8.3, §11): imagery canvas, HUD provenance, segment overlay, HUD labels, legend,
   pass selection, compare slider, pass loop, and the segment drawer. */
(function () {
  'use strict';
  const TT = window.TT;
  const H = TT.h;
  const F = TT.fmt;
  const app = () => TT.app;
  const CLASSES = ['energy', 'logistics', 'maritime', 'industrial'];
  let colorCache = null;
  const colors = () => colorCache || (colorCache = { energy: TT.cssVar('--cls-energy'), logistics: TT.cssVar('--cls-logistics'), maritime: TT.cssVar('--cls-maritime'), industrial: TT.cssVar('--cls-industrial'), amber: TT.cssVar('--amber'), bg: TT.cssVar('--imagery-bg'), text2: TT.cssVar('--text-2'), gutter: TT.cssVar('--gutter') });
  let seq = 0;

  function bbox(seg) {
    const g = seg.geom;
    if (g.t === 'circle') return { x: g.cx - g.r, y: g.cy - g.r * 1.6, w: g.r * 2, h: g.r * 3.2 };
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    g.pts.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function inPoly(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function segArea(seg) { const b = bbox(seg); return b.w * b.h; }
  TT.metricText = function (m, v) {
    if (v == null) v = m.value;
    if (v == null) return '—';
    if (typeof v !== 'number') return String(v);
    const d = m.digits == null ? 1 : m.digits;
    return F.num(v, d) + (m.unit || '');
  };
  TT.metricDelta = function (m) {
    if (m.delta == null || typeof m.delta !== 'number') return '—';
    const d = m.digits == null ? 1 : m.digits;
    return TT.tri(m.delta) + ' ' + F.delta(m.delta, d) + (m.deltaUnit ? ' ' + m.deltaUnit.trim() : '');
  };

  class Orbital {
    constructor(o) {
      this.o = o || {};
      this.uid = 'orb' + (++seq);
      this.site = null; this.res = null; this.passCanvas = null; this.priorCanvas = null;
      this.sel = null; this.compare = false; this.cmp = 0.5; this.iso = null; this.labels = true; this.playing = null; this.token = 0; this.error = null;
      this.canvas = H('canvas', { class: 'view-canvas', role: 'img', 'aria-label': 'Satellite imagery' });
      this.hud = H('div', { class: 'orb-hud' });
      this.labelsEl = H('div', { class: 'orb-labels' });
      this.legend = H('div', { class: 'orb-legend', role: 'group', 'aria-label': 'Segment classes and confidence filter' });
      this.loading = H('div', { class: 'orb-loading', hidden: true }, H('span', { text: 'Loading pass…' }));
      this.range = H('input', { type: 'range', min: '0', max: '100', value: '50', id: this.uid + '-cmp', 'aria-label': 'Compare: current pass left of the line, prior pass right of it' });
      this.cmpWrap = H('div', { class: 'orb-compare', hidden: true }, this.range);
      this.cmpTag = H('div', { class: 'cmp-tag r', hidden: true });
      this.stage = H('div', { class: 'orb' }, this.canvas, this.labelsEl, this.hud, this.cmpTag, this.legend, this.cmpWrap, this.loading);
      this.sr = H('ul', { class: 'sr-only', 'aria-label': 'Visible segments' });
      this.el = H('div', { class: 'orb-wrap', id: this.uid }, this.stage, this.sr);
      this.listeners = new Set();
      this.drawSoon = () => { if (!this.rafId) this.rafId = requestAnimationFrame(() => { this.rafId = 0; this.draw(); }); };
      new ResizeObserver(() => this.drawSoon()).observe(this.stage);
      this.range.addEventListener('input', () => { this.cmp = this.range.value / 100; this.drawSoon(); });
      this.bindPointer();
      TT.bus.on('prefs', (e) => { if (e.key === 'minConf') { this.drawSoon(); this.renderLegend(); this.emit(); } });
      TT.bus.on('sites', () => { if (this.res && !this.playing && this.passIdx === this.passes.length - 1 && !app().imgCache.has(this.site + ':latest')) this.load(this.site); });
    }
    on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    emit() { this.listeners.forEach((fn) => fn(this)); }
    get passes() { return this.res ? this.res.passes : []; }
    get passIdx() { return this.res ? this.res.pass.i : null; }
    get segments() { return this.res ? this.res.pass.segments : []; }
    seg(id) { return this.segments.find((s) => s.id === id) || null; }
    visible() {
      const min = app().prefs.minConf;
      return this.segments.filter((s) => s.id === this.sel || (s.conf >= min && (!this.iso || s.cls === this.iso)));
    }

    async load(site, pass) {
      const token = ++this.token;
      const siteChanged = site !== this.site;
      if (siteChanged) { this.stop(); this.sel = null; this.iso = null; }
      this.site = site;
      app().orbitalSite = site;
      this.error = null;
      const cachedKey = app().imgCache.has(site + ':' + (pass == null ? 'latest' : pass));
      if (!cachedKey || siteChanged) { this.showPlaceholder(siteChanged); }
      let res;
      try { res = await app().imagery(site, pass); }
      catch (err) { if (token !== this.token) return; this.showError(err); return; }
      if (token !== this.token) return;
      const canvas = await TT.Imagery.passCanvas(res.pass).catch((err) => { this.showError(err); return null; });
      if (!canvas || token !== this.token) return;
      this.res = res; this.passCanvas = canvas;
      this.priorCanvas = null;
      if (this.compare && res.prior) this.priorCanvas = await TT.Imagery.passCanvas(res.prior).catch(() => null);
      if (this.compare && !res.prior) this.setCompare(false, true);
      if (token !== this.token) return;
      this.loading.hidden = true;
      if (this.sel && app().selected && app().selected.site === site) app().selected.pass = res.pass.i;
      this.renderHud(); this.renderLegend(); this.draw(); this.renderSr();
      this.emit();
      if (TT.SegDrawer.isOpenFor(this)) TT.SegDrawer.refresh(this);
    }
    retry() { if (this.site) { app().imgCache.delete(this.site + ':latest'); this.load(this.site, this.passIdx); } }
    showPlaceholder() {
      this.loading.hidden = false;
      this.loading.firstChild.textContent = 'Loading pass…';
      const { w, h } = this.size();
      const ctx = TT.fitCanvas(this.canvas, w, h);
      ctx.fillStyle = colors().bg; ctx.fillRect(0, 0, w, h);
      const ph = TT.Imagery.placeholder(this.site);
      const r = this.fit();
      if (ph) {
        ctx.save(); if ('filter' in ctx) ctx.filter = 'blur(6px)'; ctx.imageSmoothingEnabled = true;
        ctx.drawImage(ph, r.ox, r.oy, r.dw, r.dh); ctx.restore();
      } else {
        ctx.strokeStyle = colors().gutter; ctx.lineWidth = 1;
        for (let x = r.ox; x <= r.ox + r.dw; x += r.dw / 16) { ctx.beginPath(); ctx.moveTo(x, r.oy); ctx.lineTo(x, r.oy + r.dh); ctx.stroke(); }
        for (let y = r.oy; y <= r.oy + r.dh; y += r.dh / 10) { ctx.beginPath(); ctx.moveTo(r.ox, y); ctx.lineTo(r.ox + r.dw, y); ctx.stroke(); }
      }
      this.labelsEl.replaceChildren();
    }
    showMessage(text) {
      this.loading.hidden = false;
      this.loading.replaceChildren(H('span', { text: text }));
    }
    showError(err) {
      this.error = err;
      this.loading.hidden = false;
      this.loading.replaceChildren(H('span', { style: { pointerEvents: 'auto', display: 'inline-flex', gap: '10px', alignItems: 'center' } }, 'Imagery unavailable. ' + ((err && err.message) || ''), H('button', { class: 'btn', type: 'button', onclick: () => { this.loading.replaceChildren(H('span', { text: 'Loading pass…' })); this.retry(); } }, 'RETRY')));
    }
    size() { const r = this.stage.getBoundingClientRect(); return { w: Math.max(1, Math.floor(r.width)), h: Math.max(1, Math.floor(r.height)) }; }
    fit() {
      const { w, h } = this.size();
      const s = Math.min(w / TT.Imagery.W, h / TT.Imagery.H);
      const dw = TT.Imagery.W * s, dh = TT.Imagery.H * s;
      return { w: w, h: h, s: s, dw: dw, dh: dh, ox: (w - dw) / 2, oy: (h - dh) / 2 };
    }
    toScreen(nx, ny, r) { return [r.ox + nx * r.dw, r.oy + ny * r.dh]; }

    draw() {
      if (!this.res || !this.passCanvas) return;
      const r = this.fit();
      const ctx = TT.fitCanvas(this.canvas, r.w, r.h);
      const C = colors();
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, r.w, r.h);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      const cmpOn = this.compare && this.priorCanvas;
      const divX = r.ox + r.dw * this.cmp;
      if (cmpOn) {
        ctx.drawImage(this.priorCanvas, r.ox, r.oy, r.dw, r.dh);
        ctx.save(); ctx.beginPath(); ctx.rect(r.ox, r.oy, divX - r.ox, r.dh); ctx.clip();
        ctx.drawImage(this.passCanvas, r.ox, r.oy, r.dw, r.dh);
        this.drawSegs(ctx, r, this.visible(), false);
        ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.rect(divX, r.oy, r.ox + r.dw - divX, r.dh); ctx.clip();
        const min = app().prefs.minConf;
        this.drawSegs(ctx, r, this.res.prior.segments.filter((s) => s.id === this.sel || (s.conf >= min && (!this.iso || s.cls === this.iso))), true);
        ctx.restore();
        ctx.fillStyle = C.amber; ctx.fillRect(Math.round(divX) - 1, r.oy, 2, r.dh);
        ctx.beginPath(); ctx.arc(divX, r.oy + r.dh / 2, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.bg; ctx.font = 'bold 10px ' + TT.cssVar('--font-mono'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('↔', divX, r.oy + r.dh / 2 + 0.5);
        this.cmpTag.hidden = false;
        TT.setText(this.cmpTag, '◀ CURRENT ' + F.utcDate(this.res.pass.ts) + '  │  PRIOR ' + F.utcDate(this.res.prior.ts) + ' ▶');
      } else {
        ctx.drawImage(this.passCanvas, r.ox, r.oy, r.dw, r.dh);
        this.drawSegs(ctx, r, this.visible(), false);
        this.cmpTag.hidden = true;
      }
      this.cmpWrap.hidden = !cmpOn;
      if (cmpOn) { this.cmpWrap.style.left = Math.round(r.ox) + 'px'; this.cmpWrap.style.right = Math.round(r.w - r.ox - r.dw) + 'px'; }
      this.layoutLabels(r);
      this.lastFit = r;
    }
    drawSegs(ctx, r, segs, dashed) {
      const C = colors();
      const ordered = segs.slice().sort((a, b) => (a.id === this.sel) - (b.id === this.sel) || segArea(b) - segArea(a));
      ordered.forEach((s) => {
        const col = C[s.cls] || C.amber;
        const sel = s.id === this.sel;
        ctx.beginPath();
        if (s.geom.t === 'circle') { const [x, y] = this.toScreen(s.geom.cx, s.geom.cy, r); ctx.arc(x, y, s.geom.r * r.dw, 0, Math.PI * 2); }
        else s.geom.pts.forEach(([nx, ny], k) => { const [x, y] = this.toScreen(nx, ny, r); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.closePath();
        ctx.globalAlpha = sel ? 0.2 : s.hud ? 0.07 : 0.04; ctx.fillStyle = col; ctx.fill();
        ctx.globalAlpha = 1;
        if (dashed) ctx.setLineDash([5, 4]);
        if (sel) { ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.stroke(); }
        ctx.lineWidth = sel ? 3 : 2; ctx.strokeStyle = col; ctx.globalAlpha = sel ? 1 : s.hud ? 0.9 : 0.62; ctx.stroke();
        if (sel) { ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke(); }
        ctx.globalAlpha = 1; ctx.setLineDash([]);
      });
    }
    layoutLabels(r) {
      const show = this.visible().filter((s) => (this.labels && s.hud) || s.id === this.sel);
      const cmpOn = this.compare && this.priorCanvas;
      const stageRect = this.stage.getBoundingClientRect();
      const hudRect = this.hud.getBoundingClientRect();
      const blocked = [{ x: hudRect.left - stageRect.left - 2, y: hudRect.top - stageRect.top - 2, w: hudRect.width + 4, h: hudRect.height + 4 }];
      if (!this.cmpTag.hidden) { const t = this.cmpTag.getBoundingClientRect(); blocked.push({ x: t.left - stageRect.left, y: t.top - stageRect.top, w: t.width, h: t.height }); }
      const frag = [];
      show.forEach((s) => {
        const b = bbox(s);
        let [x, y] = this.toScreen(b.x, b.y, r);
        if (cmpOn && x > r.ox + r.dw * this.cmp && s.id !== this.sel) return;
        const btn = H('button', { class: 'hud-label cls-' + s.cls + (s.id === this.sel ? ' sel' : ''), type: 'button', dataset: { seg: s.id }, 'aria-pressed': s.id === this.sel ? 'true' : 'false',
          'aria-label': s.label + ' ' + TT.fmt.conf(s.conf) + ', ' + s.cls + '. Open segment detail.' },
        H('span', { class: 't', text: s.label }), ' ', H('span', { class: 'c', text: TT.fmt.conf(s.conf) }));
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.select(s.id); });
        frag.push({ btn: btn, x: x, y: y });
      });
      this.labelsEl.replaceChildren.apply(this.labelsEl, frag.map((f) => f.btn));
      const placed = [];
      frag.forEach((f) => {
        const bw = f.btn.offsetWidth, bh = f.btn.offsetHeight || 18;
        let lx = TT.clamp(f.x, 4, r.w - bw - 4), ly = f.y - bh - 2;
        if (ly < 4) ly = f.y + 4;
        let guard = 0;
        const hit = () => blocked.concat(placed).find((o) => lx < o.x + o.w && lx + bw > o.x && ly < o.y + o.h && ly + bh > o.y);
        let o;
        while ((o = hit()) && guard < 14) { ly = o.y + o.h + 2; guard++; }
        ly = TT.clamp(ly, 4, r.h - bh - 4);
        f.btn.style.left = lx + 'px'; f.btn.style.top = ly + 'px';
        placed.push({ x: lx, y: ly, w: bw, h: bh });
      });
    }
    renderHud() {
      const p = this.res.pass, site = this.res.site;
      this.hud.replaceChildren(
        H('div', { class: 'site', text: site.name.toUpperCase() }),
        H('div', null, H('span', { class: 'k', text: 'SENSOR' }), ' ' + p.sensor + ' · ' + F.num(p.gsd, 2) + ' m GSD'),
        H('div', null, H('span', { class: 'k', text: 'PASS' }), ' ' + F.utcDate(p.ts) + ' · ' + F.age(p.ts) + ' ago'),
        H('div', null, H('span', { class: 'k', text: 'MODEL' }), ' ' + p.model),
      );
      this.canvas.setAttribute('aria-label', site.name + ' satellite pass ' + F.utcDate(p.ts) + ', ' + this.visible().length + ' segments shown. Segment list follows.');
    }
    renderLegend() {
      if (!this.res) return;
      const min = app().prefs.minConf;
      const present = CLASSES.filter((c) => this.segments.some((s) => s.cls === c));
      const shown = this.segments.filter((s) => s.conf >= min);
      const avg = shown.length ? shown.reduce((a, s) => a + s.conf, 0) / shown.length : 0;
      const items = present.map((c) => {
        const n = shown.filter((s) => s.cls === c).length;
        const on = !this.iso || this.iso === c;
        return H('button', { class: 'lg' + (this.iso === c ? ' iso' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false', dataset: { cls: c }, 'data-tip': this.iso === c ? 'Show all classes' : 'Isolate ' + c,
          onclick: () => { this.iso = this.iso === c ? null : c; this.renderLegend(); this.draw(); this.renderSr(); this.emit(); } },
        H('i', { class: 'sw cls-' + c }), c.toUpperCase() + ' ', H('b', { text: String(n) }));
      });
      const step = (d) => { app().setPref('minConf', TT.round(TT.clamp(min + d, 0.5, 0.95), 2)); };
      this.legend.replaceChildren.apply(this.legend, items.concat([
        H('span', { class: 'conf' }, 'MIN CONF',
          H('button', { type: 'button', 'aria-label': 'Lower minimum confidence', onclick: () => step(-0.05) }, '−'),
          H('b', { text: min.toFixed(2), 'aria-live': 'polite' }),
          H('button', { type: 'button', 'aria-label': 'Raise minimum confidence', onclick: () => step(0.05) }, '+'),
          ' · AVG ', H('b', { text: avg.toFixed(2) }), ' · ', H('b', { text: String(shown.length) }), '/' + this.segments.length),
      ]));
    }
    renderSr() {
      this.sr.replaceChildren.apply(this.sr, this.visible().map((s) => H('li', null, s.label + ', ' + s.cls + ', confidence ' + TT.fmt.conf(s.conf) + ', ' + s.metric.name + ' ' + TT.metricText(s.metric))));
    }

    hit(px, py) {
      const r = this.lastFit; if (!r) return null;
      const nx = (px - r.ox) / r.dw, ny = (py - r.oy) / r.dh;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
      if (this.compare && this.priorCanvas && nx > this.cmp) return null;
      const hits = this.visible().filter((s) => {
        if (s.geom.t === 'circle') { const dx = (nx - s.geom.cx) * r.dw, dy = (ny - s.geom.cy) * r.dh; return Math.hypot(dx, dy) <= s.geom.r * r.dw; }
        return inPoly(s.geom.pts, nx, ny);
      });
      hits.sort((a, b) => segArea(a) - segArea(b));
      return hits[0] || null;
    }
    bindPointer() {
      let drag = false, moved = false;
      const pos = (e) => { const b = this.canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
      this.canvas.addEventListener('pointerdown', (e) => {
        const [x] = pos(e); moved = false;
        if (this.compare && this.priorCanvas && this.lastFit && Math.abs(x - (this.lastFit.ox + this.lastFit.dw * this.cmp)) < 14) { drag = true; this.canvas.setPointerCapture(e.pointerId); }
      });
      this.canvas.addEventListener('pointermove', (e) => {
        const [x, y] = pos(e);
        if (drag) { moved = true; this.cmp = TT.clamp((x - this.lastFit.ox) / this.lastFit.dw, 0.02, 0.98); this.range.value = Math.round(this.cmp * 100); this.drawSoon(); return; }
        const s = this.hit(x, y);
        this.stage.classList.toggle('hovering', !!s);
        if (s) TT.ui.showTipAt(s.label + ' · ' + s.cls + ' · conf ' + TT.fmt.conf(s.conf) + ' · ' + s.metric.name + ' ' + TT.metricText(s.metric), e.clientX, e.clientY, 'Click for detail');
        else TT.ui.hideTip();
      });
      this.canvas.addEventListener('pointerup', (e) => { if (drag) { drag = false; this.canvas.releasePointerCapture(e.pointerId); } });
      this.canvas.addEventListener('pointerleave', () => { this.stage.classList.remove('hovering'); TT.ui.hideTip(); });
      this.canvas.addEventListener('click', (e) => {
        if (moved) { moved = false; return; }
        const [x, y] = pos(e);
        const s = this.hit(x, y);
        if (s) this.select(s.id);
      });
    }

    select(id, opts) {
      opts = opts || {};
      this.sel = id;
      if (id) app().selected = { site: this.site, id: id, pass: this.passIdx };
      else if (app().selected && app().selected.site === this.site) app().selected = null;
      TT.bus.emit('pins');
      this.draw(); this.renderSr();
      this.emit();
      if (id && !opts.silent) TT.SegDrawer.open(this, id);
    }
    setPass(i) { if (!this.res) return; const n = this.passes.length; i = TT.clamp(i, 0, n - 1); if (i !== this.passIdx) this.load(this.site, i); }
    step(d) { if (this.res) this.setPass(this.passIdx + d); }
    async setCompare(on, quiet) {
      on = on == null ? !this.compare : on;
      if (on && (!this.res || !this.res.prior)) { if (!quiet) TT.ui.toast('No prior pass to compare with. Select a later pass.'); on = false; }
      if (on) this.stop();
      this.compare = on;
      if (on && this.res && this.res.prior) this.priorCanvas = await TT.Imagery.passCanvas(this.res.prior).catch(() => null);
      this.draw(); this.emit();
    }
    toggleLabels() { this.labels = !this.labels; this.draw(); this.emit(); }
    async play() {
      if (this.playing) { this.stop(); return; }
      if (!this.res) return;
      if (this.compare) await this.setCompare(false, true);
      const site = this.site;
      this.playing = { site: site };
      this.emit();
      await app().allPasses(site, 6).catch(() => null);
      if (!this.playing || this.site !== site) return;
      const n = this.passes.length, first = Math.max(0, n - 6);
      if (this.passIdx === n - 1 || this.passIdx < first) await this.load(site, first);
      this.playing.timer = setInterval(() => {
        if (!this.playing || this.site !== site) { this.stop(); return; }
        this.load(site, this.passIdx >= n - 1 ? first : this.passIdx + 1);
      }, 1200);
    }
    stop() { if (this.playing) { clearInterval(this.playing.timer); this.playing = null; this.emit(); } }
    handleKey(e) {
      if (e.key === '[') { this.step(-1); return true; }
      if (e.key === ']') { this.step(1); return true; }
      const k = e.key.toLowerCase();
      if (k === 'p') { this.play(); return true; }
      if (k === 'c') { this.setCompare(); return true; }
      if (k === 'l') { this.toggleLabels(); return true; }
      return false;
    }

    /* Compact or full control bar bound to this viewer. */
    controls(full) {
      const siteSel = H('select', { id: this.uid + '-site', 'aria-label': 'Site' });
      const passSel = H('select', { id: this.uid + '-pass', 'aria-label': 'Pass (UTC)' });
      const prev = H('button', { class: 'btn', type: 'button', 'aria-label': 'Previous pass', 'data-tip': 'Previous pass  [' }, '◀');
      const next = H('button', { class: 'btn', type: 'button', 'aria-label': 'Next pass', 'data-tip': 'Next pass  ]' }, '▶');
      const playBtn = H('button', { class: 'btn', type: 'button', 'aria-pressed': 'false', 'data-tip': 'Loop the last 6 passes  P' }, 'PLAY');
      const cmpBtn = H('button', { class: 'btn', type: 'button', 'aria-pressed': 'false', 'data-tip': 'Compare with the prior pass  C' }, 'COMPARE');
      const lblBtn = H('button', { class: 'btn', type: 'button', 'aria-pressed': 'true', 'data-tip': 'Show or hide HUD labels  L' }, 'LABELS');
      siteSel.addEventListener('change', () => { if (full) TT.router.go('orbital/' + siteSel.value); else this.load(siteSel.value); });
      passSel.addEventListener('change', () => this.setPass(Number(passSel.value)));
      prev.addEventListener('click', () => this.step(-1));
      next.addEventListener('click', () => this.step(1));
      playBtn.addEventListener('click', () => this.play());
      cmpBtn.addEventListener('click', () => this.setCompare());
      lblBtn.addEventListener('click', () => this.toggleLabels());
      const kids = [siteSel, H('span', { class: 'sep' }), prev, passSel, next, playBtn, cmpBtn];
      if (full) kids.push(lblBtn);
      const bar = H('div', { class: 'orb-ctl' }, kids);
      const sync = () => {
        const sites = app().sites.length ? app().sites : (this.res ? [this.res.site] : []);
        if (siteSel.options.length !== sites.length) siteSel.replaceChildren.apply(siteSel, sites.map((s) => H('option', { value: s.id }, s.name)));
        if (this.site) siteSel.value = this.site;
        if (this.res) {
          const opts = this.passes.map((p, k) => H('option', { value: String(p.i) }, F.utcDate(p.ts) + (k === this.passes.length - 1 ? ' · latest' : '')));
          if (passSel.options.length !== opts.length || passSel.dataset.site !== this.site) { passSel.replaceChildren.apply(passSel, opts); passSel.dataset.site = this.site; }
          passSel.value = String(this.passIdx);
          prev.disabled = this.passIdx <= 0; next.disabled = this.passIdx >= this.passes.length - 1;
          cmpBtn.disabled = !this.res.prior;
        }
        playBtn.setAttribute('aria-pressed', this.playing ? 'true' : 'false'); TT.setText(playBtn, this.playing ? 'STOP' : 'PLAY');
        cmpBtn.setAttribute('aria-pressed', this.compare ? 'true' : 'false');
        lblBtn.setAttribute('aria-pressed', this.labels ? 'true' : 'false');
      };
      this.on(sync);
      TT.bus.on('sites', sync);
      sync();
      return bar;
    }
  }
  TT.Orbital = Orbital;

  /* ---------- segment drawer ---------- */
  function cropFor(seg) {
    const b = bbox(seg);
    const k = b.w > 0.2 ? 1.12 : 1.9;
    let w = Math.max(b.w * k, 0.1), h = Math.max(b.h * k, 0.1);
    const aspect = (TT.Imagery.W / TT.Imagery.H);
    if (w * TT.Imagery.W / (h * TT.Imagery.H) > 1.6) h = (w * aspect) / 1.6; else w = (h * 1.6) / aspect;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    return { x: TT.clamp(cx - w / 2, 0, Math.max(0, 1 - w)), y: TT.clamp(cy - h / 2, 0, Math.max(0, 1 - h)), w: Math.min(1, w), h: Math.min(1, h) };
  }
  function promptFor(site, seg) {
    const demo = app().mode === 'scaffold' && TT.mock && TT.mock.segmentPrompt ? TT.mock.segmentPrompt(site, seg.id) : null;
    return demo || 'Brief me on this segment: ' + seg.label.split(' · ')[0];
  }
  TT.SegDrawer = {
    isOpenFor(viewer) { const d = TT.ui.drawer(); return !!d && d.kind === 'segment' && d.owner === viewer; },
    open(viewer, id) {
      TT.ui.openDrawer({ owner: viewer, kind: 'segment', title: '', render: () => { }, onClose: () => { if (viewer.sel) viewer.select(null, { silent: true }); } });
      TT.SegDrawer.refresh(viewer, id);
    },
    refresh(viewer, id) {
      const d = TT.ui.drawer();
      if (!d || d.owner !== viewer) return;
      id = id || viewer.sel;
      const seg = viewer.seg(id);
      const res = viewer.res;
      const site = res.site;
      d.render({
        owner: viewer, kind: 'segment',
        title: seg ? seg.label : id.toUpperCase(),
        tag: seg ? H('span', { class: 'tag cls-' + seg.cls, style: { borderColor: 'currentColor' } }, seg.cls) : H('span', { class: 'tag info' }, 'segment'),
        onClose: () => { if (viewer.sel) viewer.select(null, { silent: true }); },
        render(body, acts) {
          if (!seg) {
            body.append(H('p', { class: 'muted' }, 'Not detected on the ' + F.utcDate(res.pass.ts) + ' pass. Step to another pass to see it.'));
            body.append(H('div', { class: 'prov' }, site.name + ' · ' + res.pass.sensor + ' · ' + res.pass.model));
            return;
          }
          const m = seg.metric;
          const cells = [
            ['Confidence', TT.fmt.conf(seg.conf)],
            ['Area', F.int(seg.area_m2) + ' m²'],
            [m.name, TT.metricText(m)],
            ['Change vs prior pass', TT.metricDelta(m)],
          ];
          if (seg.extra) cells.push([seg.extra.name, F.delta(seg.extra.value, 2) + ' ' + seg.extra.unit]);
          if (seg.status) cells.push(['Status', seg.status]);
          if (m.prior != null && typeof m.prior === 'number') cells.push(['Prior pass value', TT.metricText(m, m.prior)]);
          cells.push(['Class', seg.cls]);
          body.append(H('div', { class: 'dl' }, cells.map(([k, v]) => H('div', null, H('span', { class: 'k', text: k }), H('span', { class: 'v' + (String(v).length > 12 ? ' sm' : ''), text: v, 'data-tip': String(v).length > 16 ? v : null })))));
          const crop = cropFor(seg);
          const mkThumb = (pass, label) => { const c = H('canvas', { width: 320, height: 200, role: 'img', 'aria-label': label }); TT.Imagery.drawCrop(pass, c, crop).catch(() => null); return H('figure', null, c, H('figcaption', null, label)); };
          const thumbs = [];
          if (res.prior) thumbs.push(mkThumb(res.prior, 'PRIOR · ' + F.utcDate(res.prior.ts)));
          thumbs.push(mkThumb(res.pass, 'CURRENT · ' + F.utcDate(res.pass.ts)));
          body.append(H('div', { class: 'thumbs' }, thumbs));
          body.append(H('div', { class: 'rule' }, H('b', null, 'DETECTION RULE  '), seg.rule));
          body.append(H('div', { class: 'prov' },
            H('div', null, 'SITE ' + site.name + ' · ' + site.region),
            H('div', null, 'SENSOR ' + res.pass.sensor + ' · ' + F.num(res.pass.gsd, 2) + ' m GSD'),
            H('div', null, 'PASS ' + F.utcDate(res.pass.ts) + (res.prior ? ' · PRIOR ' + F.utcDate(res.prior.ts) : '')),
            H('div', null, 'MODEL ' + res.pass.model + ' · SEGMENT ' + seg.id)));
          const pinned = app().isPinned('segment', seg.id, site.id);
          acts.append(
            H('button', { class: 'btn btn-amber btn-lg', type: 'button', onclick: () => {
              const prompt = promptFor(site.id, seg);
              const onDesk = TT.router.current.view === 'desk';
              const d = TT.ui.drawer();
              if (d) { d.onClose = null; d.close(); }
              app().selected = { site: site.id, id: seg.id, pass: res.pass.i };
              TT.bus.emit('pins');
              if (!onDesk) TT.router.go('agent');
              app().ask(prompt);
              setTimeout(() => { const inp = TT.$('.view:not([hidden]) .composer input'); if (inp) inp.focus(); }, 30);
            } }, 'ASK AGENT'),
            H('button', { class: 'btn btn-lg', type: 'button', 'aria-pressed': viewer.compare ? 'true' : 'false', disabled: !res.prior, onclick: () => viewer.setCompare() }, 'COMPARE'),
            H('button', { class: 'btn btn-lg', type: 'button', 'aria-pressed': pinned ? 'true' : 'false', onclick: () => {
              app().togglePin({ kind: 'segment', id: seg.id, site: site.id, label: seg.label.split(' · ')[0] + ' · ' + site.short });
              TT.ui.toast((app().isPinned('segment', seg.id, site.id) ? 'Pinned ' : 'Unpinned ') + seg.label.split(' · ')[0] + (app().isPinned('segment', seg.id, site.id) ? ' to agent context.' : ' from agent context.'));
              TT.SegDrawer.refresh(viewer, seg.id);
            } }, pinned ? 'UNPIN' : 'PIN TO CONTEXT'),
          );
        },
      });
    },
  };
})();
