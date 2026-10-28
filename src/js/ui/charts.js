/* Canvas charts: line (cross-asset, drawer), stacked area (capital flow), and SVG sparklines.
   Data re-renders are throttled to 2 per second (§16); hover redraws are immediate. */
(function () {
  'use strict';
  const TT = window.TT;
  const H = TT.h;
  const MIN = 60000, HOUR = 3600000, DAY = 86400000;

  let paletteCache = null;
  function palette() {
    if (paletteCache) return paletteCache;
    const v = (n) => TT.cssVar(n);
    paletteCache = { text: v('--text'), text2: v('--text-2'), grid: v('--gutter'), rule: v('--rule'), amber: v('--amber'), bg: v('--bg'), hud: v('--hud-bg'), font: '10px ' + v('--font-mono'),
      series: [v('--s1'), v('--s2'), v('--s3'), v('--s4'), v('--s5'), v('--s6')] };
    return paletteCache;
  }
  TT.chartPalette = palette;

  function niceTicks(min, max, n) {
    const span = max - min || Math.abs(max) || 1;
    const raw = span / Math.max(1, n);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(TT.round(v, 10));
    return { ticks: out, step: step };
  }
  TT.niceTicks = niceTicks;

  function timeTicks(t0, t1, max) {
    const span = t1 - t0;
    const steps = [5 * MIN, 15 * MIN, 30 * MIN, HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY, 14 * DAY];
    let step = steps.find((s) => span / s <= max);
    const out = [];
    if (!step) {
      const d = new Date(t0); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0);
      const months = span / (30 * DAY) / max > 1 ? Math.ceil(span / (30 * DAY) / max) : 1;
      while (d.getTime() <= t1) { if (d.getTime() >= t0) out.push(d.getTime()); d.setUTCMonth(d.getUTCMonth() + months); }
      return { ticks: out, fmt: (t) => new Date(t).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) + (new Date(t).getUTCMonth() === 0 ? ' ' + String(new Date(t).getUTCFullYear()).slice(2) : '') };
    }
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) out.push(t);
    return { ticks: out, fmt: step < DAY ? (t) => (t % DAY === 0 ? TT.fmt.day(t) : TT.fmt.utc(t, false).replace('Z', '')) : (t) => TT.fmt.day(t) };
  }

  class Chart {
    constructor(host, opts) {
      this.host = host; this.opts = opts || {};
      host.classList.add('chart');
      this.canvas = H('canvas', { 'aria-hidden': 'true' });
      this.readout = H('div', { class: 'chart-readout', hidden: true });
      host.append(this.canvas, this.readout);
      this.data = null; this.hover = null; this.alpha = 1; this.seen = false;
      this.renderSoon = TT.throttle(() => this.render(), 500);
      this.ro = new ResizeObserver(() => this.render());
      this.ro.observe(host);
      this.canvas.addEventListener('pointermove', (e) => { const r = this.canvas.getBoundingClientRect(); this.hover = { x: e.clientX - r.left, y: e.clientY - r.top }; this.render(); });
      this.canvas.addEventListener('pointerleave', () => { this.hover = null; this.readout.hidden = true; this.render(); });
      this.canvas.addEventListener('click', (e) => { const r = this.canvas.getBoundingClientRect(); this.click(e.clientX - r.left, e.clientY - r.top); });
    }
    setData(d) {
      const first = !this.seen && d && this.hasSeries(d);
      this.data = d;
      if (first) {
        this.seen = true;
        if (!TT.motionReduced()) {
          this.alpha = 0;
          const t0 = performance.now();
          const step = (now) => { this.alpha = Math.min(1, (now - t0) / 320); this.render(); if (this.alpha < 1) requestAnimationFrame(step); };
          requestAnimationFrame(step);
          return;
        }
      }
      this.renderSoon();
    }
    hasSeries() { return true; }
    size() { const r = this.host.getBoundingClientRect(); return { w: Math.floor(r.width), h: Math.floor(r.height) }; }
    showReadout(x, y, children) {
      const ro = this.readout;
      ro.replaceChildren.apply(ro, children); ro.hidden = false;
      const { w } = this.size();
      const rw = ro.offsetWidth;
      ro.style.left = (x + 14 + rw > w ? Math.max(4, x - rw - 14) : x + 14) + 'px';
      ro.style.top = Math.max(4, y - 10) + 'px';
    }
    click() { }
    destroy() { this.ro.disconnect(); this.dead = true; }
  }

  /* ---------- line chart ---------- */
  class LineChart extends Chart {
    hasSeries(d) { return d.series && d.series.some((s) => s.points && s.points.length); }
    render() {
      if (this.dead) return;
      const { w, h } = this.size();
      if (w < 20 || h < 20) return;
      const ctx = TT.fitCanvas(this.canvas, w, h);
      const P = palette();
      ctx.clearRect(0, 0, w, h);
      ctx.font = P.font;
      const d = this.data || { series: [] };
      const pad = { l: 56, r: this.opts.endLabels ? 74 : 14, t: 14, b: 30 };
      const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
      const vis = (d.series || []).filter((s) => s.visible !== false && s.points.length);
      const base = (s) => { if (s._base == null) { const p = s.points.find((x) => x[1]); s._base = p ? p[1] : 0; } return s._base; };
      const tr = (s, v) => (d.rebase && base(s) ? (v / base(s)) * 100 : v);
      let t0 = Infinity, t1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      vis.forEach((s) => s.points.forEach(([t, v]) => { const y = tr(s, v); if (t < t0) t0 = t; if (t > t1) t1 = t; if (y < y0) y0 = y; if (y > y1) y1 = y; }));
      if (!vis.length) { t1 = Date.now(); t0 = t1 - DAY; y0 = d.rebase ? 99 : 0; y1 = d.rebase ? 101 : 1; }
      if (y0 === y1) { y0 -= 1; y1 += 1; }
      const yp = (y1 - y0) * 0.08; y0 -= yp; y1 += yp;
      const X = (t) => pad.l + ((t - t0) / (t1 - t0 || 1)) * pw;
      const Y = (v) => pad.t + (1 - (v - y0) / (y1 - y0)) * ph;
      this.geom = { X: X, Y: Y, t0: t0, t1: t1, pad: pad, pw: pw, ph: ph, tr: tr, vis: vis };

      // axes first
      const yt = niceTicks(y0, y1, Math.max(3, Math.floor(ph / 44)));
      ctx.strokeStyle = P.grid; ctx.lineWidth = 1; ctx.fillStyle = P.text2; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const yd = yt.step < 0.01 ? 4 : yt.step < 0.1 ? 3 : yt.step < 1 ? 2 : yt.step < 10 ? 1 : 0;
      yt.ticks.forEach((v) => { const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + pw, y); ctx.stroke(); ctx.fillText((this.opts.yFmt || ((x) => TT.fmt.num(x, yd)))(v), pad.l - 6, y); });
      const xt = timeTicks(t0, t1, Math.max(2, Math.floor(pw / 90)));
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      xt.ticks.forEach((t) => { const x = Math.round(X(t)) + 0.5; ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph); ctx.stroke(); ctx.fillText(xt.fmt(t), x, pad.t + ph + 6); });
      ctx.strokeStyle = P.text2; ctx.beginPath(); ctx.moveTo(pad.l + 0.5, pad.t); ctx.lineTo(pad.l + 0.5, pad.t + ph); ctx.lineTo(pad.l + pw, pad.t + ph + 0.5); ctx.stroke();
      ctx.save(); ctx.translate(12, pad.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.yLabel || '', 0, 0); ctx.restore();
      ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(d.xLabel || 'TIME (UTC)', pad.l + pw, h - 1);

      // series
      ctx.save(); ctx.globalAlpha = this.alpha;
      ctx.beginPath(); ctx.rect(pad.l, pad.t - 2, pw + 2, ph + 4); ctx.clip();
      vis.forEach((s, k) => {
        const col = s.color || P.series[k % P.series.length];
        if (s.area) {
          ctx.beginPath(); s.points.forEach(([t, v], j) => (j ? ctx.lineTo(X(t), Y(tr(s, v))) : ctx.moveTo(X(t), Y(tr(s, v)))));
          ctx.lineTo(X(s.points[s.points.length - 1][0]), pad.t + ph); ctx.lineTo(X(s.points[0][0]), pad.t + ph); ctx.closePath();
          ctx.globalAlpha = this.alpha * 0.12; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = this.alpha;
        }
        ctx.beginPath(); s.points.forEach(([t, v], j) => (j ? ctx.lineTo(X(t), Y(tr(s, v))) : ctx.moveTo(X(t), Y(tr(s, v)))));
        ctx.strokeStyle = col; ctx.lineWidth = s.emph ? 2 : 1.5; ctx.lineJoin = 'round'; ctx.stroke();
        const last = s.points[s.points.length - 1];
        ctx.beginPath(); ctx.arc(X(last[0]), Y(tr(s, last[1])), 2.5, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      });
      ctx.restore();

      // end labels, de-overlapped
      if (this.opts.endLabels && vis.length) {
        const labs = vis.map((s, k) => { const last = s.points[s.points.length - 1]; return { y: Y(tr(s, last[1])), text: s.label || s.id, col: s.color || P.series[k % P.series.length] }; }).sort((a, b) => a.y - b.y);
        for (let k = 1; k < labs.length; k++) if (labs[k].y - labs[k - 1].y < 12) labs[k].y = labs[k - 1].y + 12;
        ctx.globalAlpha = this.alpha; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        labs.forEach((l) => { ctx.fillStyle = l.col; ctx.fillText(l.text, pad.l + pw + 8, TT.clamp(l.y, pad.t + 4, pad.t + ph)); });
        ctx.globalAlpha = 1;
      }

      // markers (§9: amber ring plus label)
      this.markerPos = [];
      const boxes = [];
      const clash = (x, y, w) => boxes.some((b) => x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + 14 > b[1]);
      (d.markers || []).forEach((m) => {
        const s = vis.find((z) => z.id === m.sym);
        if (!s || m.t < t0 || m.t > t1) return;
        const v = interp(s.points, m.t);
        if (v == null) return;
        const x = X(m.t), y = Y(tr(s, v));
        ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.strokeStyle = P.amber; ctx.lineWidth = 2; ctx.stroke();
        ctx.font = P.font;
        const tw = ctx.measureText(m.label).width;
        const lx = TT.clamp(x - tw / 2, pad.l + 2, pad.l + pw - tw - 2);
        const fits = (yy) => yy >= pad.t && yy + 14 <= pad.t + ph;
        const tries = [y - 22, y + 12, y - 40, y + 30, y - 58, y + 48, y - 76, y + 66].filter(fits);
        const ly = tries.find((yy) => !clash(lx - 4, yy, tw + 8)) ?? (tries[0] ?? (y - 22 < pad.t ? y + 12 : y - 22));
        boxes.push([lx - 4, ly, tw + 8, 14]);
        if (Math.abs(ly - (y - 22)) > 1 && Math.abs(ly - (y + 12)) > 1) { ctx.strokeStyle = P.amber; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + (ly < y ? -6 : 6)); ctx.lineTo(x, ly < y ? ly + 14 : ly); ctx.stroke(); }
        ctx.fillStyle = P.hud; ctx.fillRect(lx - 4, ly, tw + 8, 14);
        ctx.strokeStyle = P.amber; ctx.lineWidth = 1; ctx.strokeRect(lx - 3.5, ly + 0.5, tw + 7, 13);
        ctx.fillStyle = P.amber; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(m.label, lx, ly + 7.5);
        this.markerPos.push({ m: m, x: x, y: y, box: [lx - 4, ly, tw + 8, 14] });
      });
      this.host.classList.toggle('has-markers', this.markerPos.length > 0);

      // crosshair
      if (this.hover && vis.length && this.hover.x >= pad.l && this.hover.x <= pad.l + pw) {
        const t = t0 + ((this.hover.x - pad.l) / pw) * (t1 - t0);
        const ref = vis[0].points;
        let best = ref[0];
        for (const p of ref) if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p;
        const x = Math.round(X(best[0])) + 0.5;
        ctx.setLineDash([3, 3]); ctx.strokeStyle = P.amber; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph); ctx.stroke(); ctx.setLineDash([]);
        const rows = vis.map((s, k) => {
          const v = interp(s.points, best[0]);
          if (v == null) return null;
          ctx.beginPath(); ctx.arc(X(best[0]), Y(tr(s, v)), 3, 0, Math.PI * 2); ctx.fillStyle = s.color || P.series[k % P.series.length]; ctx.fill();
          const valTxt = s.kind === 'yield' ? TT.fmt.price(v, 'yield') + '%' : TT.fmt.price(v, s.kind);
          return H('div', { class: 'rr' }, H('span', null, s.label || s.id), H('b', null, valTxt, d.rebase ? H('span', { class: 'rt' }, ' (' + TT.fmt.num(tr(s, v), 2) + ')') : null));
        }).filter(Boolean);
        const tTxt = (t1 - t0) <= 8 * DAY ? TT.fmt.utcDate(best[0]) : TT.fmt.utcDate(best[0]).slice(0, 10);
        this.showReadout(this.hover.x, this.hover.y, [H('div', { class: 'rt' }, tTxt)].concat(rows));
      } else this.readout.hidden = true;
    }
    click(x, y) {
      if (!this.markerPos) return;
      const hit = this.markerPos.find((p) => Math.hypot(p.x - x, p.y - y) <= 10 || (x >= p.box[0] && x <= p.box[0] + p.box[2] && y >= p.box[1] && y <= p.box[1] + p.box[3]));
      if (hit && this.opts.onMarker) this.opts.onMarker(hit.m, { x: hit.x, y: hit.y });
    }
  }
  function interp(pts, t) {
    if (!pts.length) return null;
    if (t <= pts[0][0]) return t < pts[0][0] - 3600000 * 6 ? null : pts[0][1];
    for (let k = 1; k < pts.length; k++) {
      if (pts[k][0] >= t) { const a = pts[k - 1], b = pts[k]; const f = (t - a[0]) / (b[0] - a[0] || 1); return a[1] + (b[1] - a[1]) * f; }
    }
    return pts[pts.length - 1][1];
  }

  /* ---------- stacked area chart ---------- */
  class StackChart extends Chart {
    hasSeries(d) { return d.t && d.t.length; }
    render() {
      const { w, h } = this.size();
      if (w < 20 || h < 20) return;
      const ctx = TT.fitCanvas(this.canvas, w, h);
      const P = palette();
      ctx.clearRect(0, 0, w, h);
      ctx.font = P.font;
      const d = this.data;
      const pad = { l: 52, r: 12, t: 12, b: 28 };
      const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
      const share = d && d.mode === 'share';
      const n = d && d.t ? d.t.length : 0;
      const cats = d ? d.categories : [];
      const totals = Array.from({ length: n }, (_, k) => cats.reduce((s, c) => s + d.series[c][k], 0));
      const val = (c, k) => (share ? (totals[k] ? (d.series[c][k] / totals[k]) * 100 : 0) : d.series[c][k]);
      const ymax = share ? 100 : Math.max.apply(null, totals.concat([1])) * 1.08;
      const t0 = n ? d.t[0] : 0, t1 = n ? d.t[n - 1] : 1;
      const X = (t) => pad.l + ((t - t0) / (t1 - t0 || 1)) * pw;
      const Y = (v) => pad.t + (1 - v / ymax) * ph;
      const yt = niceTicks(0, ymax, Math.max(3, Math.floor(ph / 40)));
      ctx.strokeStyle = P.grid; ctx.lineWidth = 1; ctx.fillStyle = P.text2; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      yt.ticks.forEach((v) => { const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + pw, y); ctx.stroke(); ctx.fillText(share ? v + '%' : TT.fmt.int(v), pad.l - 6, y); });
      if (n) {
        const xt = timeTicks(t0, t1, Math.max(2, Math.floor(pw / 80)));
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        xt.ticks.forEach((t) => { const x = Math.round(X(t)) + 0.5; ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph); ctx.stroke(); ctx.fillText(xt.fmt(t), x, pad.t + ph + 6); });
      }
      ctx.strokeStyle = P.text2; ctx.beginPath(); ctx.moveTo(pad.l + 0.5, pad.t); ctx.lineTo(pad.l + 0.5, pad.t + ph); ctx.lineTo(pad.l + pw, pad.t + ph + 0.5); ctx.stroke();
      ctx.save(); ctx.translate(11, pad.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(share ? 'SHARE OF TOTAL %' : (d && d.unit ? d.unit : ''), 0, 0); ctx.restore();
      ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('HOUR (UTC)', pad.l + pw, h - 1);
      if (!n) return;
      ctx.save(); ctx.globalAlpha = this.alpha;
      const cum = new Array(n).fill(0);
      cats.forEach((c, ci) => {
        const col = P.series[ci % P.series.length];
        const lower = cum.slice();
        for (let k = 0; k < n; k++) cum[k] += val(c, k);
        ctx.beginPath();
        for (let k = 0; k < n; k++) { const x = X(d.t[k]), y = Y(cum[k]); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        for (let k = n - 1; k >= 0; k--) ctx.lineTo(X(d.t[k]), Y(lower[k]));
        ctx.closePath(); ctx.globalAlpha = this.alpha * 0.32; ctx.fillStyle = col; ctx.fill();
        ctx.globalAlpha = this.alpha; ctx.beginPath();
        for (let k = 0; k < n; k++) { const x = X(d.t[k]), y = Y(cum[k]); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke();
      });
      ctx.restore();
      if (this.hover && this.hover.x >= pad.l && this.hover.x <= pad.l + pw) {
        const k = TT.clamp(Math.round(((this.hover.x - pad.l) / pw) * (n - 1)), 0, n - 1);
        const x = Math.round(X(d.t[k])) + 0.5;
        ctx.setLineDash([3, 3]); ctx.strokeStyle = P.amber; ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph); ctx.stroke(); ctx.setLineDash([]);
        const rows = cats.slice().reverse().map((c) => {
          const ci = cats.indexOf(c);
          return H('div', { class: 'rr' }, H('span', null, H('i', { class: 'sw', style: { color: P.series[ci % P.series.length] } }), ' ' + c), H('b', null, share ? TT.fmt.num(val(c, k), 1) + '%' : TT.fmt.mm(d.series[c][k])));
        });
        this.showReadout(this.hover.x, this.hover.y, [H('div', { class: 'rt' }, TT.fmt.utcDate(d.t[k]))].concat(rows, [H('div', { class: 'rr' }, H('span', null, 'Total'), H('b', null, share ? '100.0%' : TT.fmt.mm(totals[k]) + ' mm'))]));
      } else this.readout.hidden = true;
    }
  }

  TT.LineChart = LineChart;
  TT.StackChart = StackChart;

  TT.sparkNode = function (vals, w, h, forceCls) {
    const s = TT.spark(vals, w, h, forceCls);
    if (!s) return H('span');
    return new DOMParser().parseFromString(s, 'image/svg+xml').documentElement;
  };
  TT.spark = function (vals, w, h, forceCls) {
    w = w || 60; h = h || 20;
    if (!vals || vals.length < 2) return '';
    let mn = Infinity, mx = -Infinity;
    vals.forEach((v) => { if (v < mn) mn = v; if (v > mx) mx = v; });
    const rng = mx - mn || 1;
    const pts = vals.map((v, k) => [TT.round((k / (vals.length - 1)) * (w - 3) + 1, 1), TT.round(h - 2 - ((v - mn) / rng) * (h - 4), 1)]);
    const line = pts.map((p) => p.join(',')).join(' ');
    const area = 'M' + pts[0][0] + ',' + (h - 1) + ' L' + pts.map((p) => p.join(',')).join(' L') + ' L' + pts[pts.length - 1][0] + ',' + (h - 1) + ' Z';
    const last = pts[pts.length - 1];
    const cls = forceCls || (vals[vals.length - 1] >= vals[0] ? 'up' : 'down');
    return '<svg class="' + cls + '" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><path d="' + area + '" fill="currentColor" opacity="0.12"/><polyline points="' + line + '" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="1.7" fill="currentColor"/></svg>';
  };
})();
