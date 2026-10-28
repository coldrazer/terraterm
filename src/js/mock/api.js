/* Scaffold backend. Implements the TERRATERM contract (see CONTRACT.md) with synthetic data.
   Required: watchlist, macro, imagery, ask. Optional: sites, quotes, series, flow, wire, events, system. */
(function () {
  'use strict';
  const TT = window.TT;

  TT.mock.createScaffold = function (opts) {
    opts = opts || {};
    const D = TT.mock.data;
    const demo = !!opts.demo;
    const cfg = opts.config || {};
    const boot = Date.now();
    const market = TT.mock.Market({ seed: 7, demo: demo, bootTs: boot });
    const scene = (id) => TT.mock.scenes.get(id, boot);
    const M = { market: market, scene: scene, boot: boot, demo: demo };
    let feedUp = true;
    let ctxUsed = demo ? 181200 : 184000; // demo lands on 184K after the beat 3 answer (§18 beat 5)
    const CTX_MAX = 1000000;
    const lat = (a, b) => TT.sleep(a + Math.random() * (b - a));
    const guard = () => { if (!feedUp) throw new Error('Feed disconnected'); };

    /* ---------- events ---------- */
    let seq = 0;
    const events = [];
    const push = (ev) => { ev.seq = ++seq; events.push(ev); return ev; };
    const keySeg = (id) => { const sc = scene(id); const i = sc.passes.length - 1; return { sc: sc, i: i, pass: sc.passes[i], seg: sc.pass(i).segments.find((s) => s.id === sc.key) }; };
    D.sites.forEach((s) => {
      const k = keySeg(s.id);
      push({ type: 'pass', ts: k.pass.ts + 4 * 60000, site: s.id, text: s.short + ' pass processed · ' + k.sc.pass(k.i).segments.length + ' segments', route: 'orbital/' + s.id });
    });
    { const k = keySeg('ela-segundo-tanks'); const m = k.seg.metric;
      push({ type: 'alert', id: 'al-es-drawdown', sev: 'high', ts: k.pass.ts + 6 * 60000, site: 'ela-segundo-tanks', segId: 'grp-b', subject: 'El Segundo · TK GROUP B',
        message: 'Group B fill ' + TT.fmt.delta(m.delta, 1) + ' pp vs prior pass (' + m.prior.toFixed(1) + '% to ' + m.value.toFixed(1) + '%), est. ' + TT.fmt.delta(k.seg.extra.value, 2) + ' Mbbl', conf: k.seg.conf, route: 'orbital/ela-segundo-tanks/grp-b' }); }
    { const k = keySeg('gary-works'); const h = k.sc.history.ore;
      push({ type: 'alert', id: 'al-gary-ore', sev: 'med', ts: k.pass.ts + 7 * 60000, site: 'gary-works', segId: 'ore', subject: 'Gary · ORE STOCKPILE',
        message: 'Ore stockpile ' + k.seg.metric.value.toFixed(2) + ' Mt, ' + TT.fmt.pct(h[h.length - 1] / h[0] - 1, 1) + ' over six passes', conf: k.seg.conf, route: 'orbital/gary-works/ore' }); }
    push({ type: 'macro', ts: boot - 6 * 60000, sym: 'CL1', text: 'WTI crosses 78.00, ' + TT.fmt.pct(market.quote('CL1').chgPct) + ' on the session', route: 'macro' });
    push({ type: 'system', ts: boot - 30000, text: 'Glimmer 30B local agent online · context restored ' + TT.fmt.tokens(ctxUsed) });
    events.sort((a, b) => a.ts - b.ts).forEach((e, k) => { e.seq = k + 1; });
    seq = events.length;

    const scheduled = [
      { at: boot + (demo ? 62000 : 40000), make: () => { const k = keySeg('san-pedro-port'); const m = k.seg.metric; return { type: 'alert', id: 'al-port-anch', sev: 'high', proactive: true, site: 'san-pedro-port', segId: 'anchorage', subject: 'San Pedro Bay · ANCHORAGE',
        message: 'Anchorage count ' + m.value + ' vessels crossed the 28 threshold (+' + m.delta + ' vs prior pass)', conf: k.seg.conf, route: 'orbital/san-pedro-port/anchorage' }; } },
      { at: boot + (demo ? 600000 : 150000), make: () => { const k = keySeg('cushing-hub'); const m = k.seg.metric; return { type: 'alert', id: 'al-cushing-build', sev: 'med', proactive: true, site: 'cushing-hub', segId: 'grp-e', subject: 'Cushing · EAST GROUP',
        message: 'East group fill ' + TT.fmt.delta(m.delta, 1) + ' pp vs prior pass crossed the 2.0 pp build threshold', conf: k.seg.conf, route: 'orbital/cushing-hub/grp-e' }; } },
    ];
    function release(now) {
      scheduled.forEach((s) => { if (!s.done && now >= s.at) { s.done = true; const ev = s.make(); ev.ts = now; push(ev); } });
    }

    /* ---------- wire ---------- */
    const wire = D.wire.map((w, k) => Object.assign({ id: 'w' + k, ts: boot - w.mins * 60000 }, w));
    let wireNext = boot + (demo ? 70000 : 45000), wireIdx = 0;
    function releaseWire(now) {
      while (now >= wireNext && wireIdx < D.wireLater.length) {
        wire.push(Object.assign({ id: 'wl' + wireIdx, ts: wireNext }, D.wireLater[wireIdx]));
        wireIdx++; wireNext += demo ? 70000 : 45000;
      }
    }

    /* ---------- signals for the macro overlay ---------- */
    const thresholds = { 'ela-segundo-tanks': 5, 'san-pedro-port': 4, 'cushing-hub': 2, 'barstow-rail': 20, 'gary-works': 0.06 };
    function signals() {
      const out = [];
      D.sites.forEach((meta) => {
        const thr = thresholds[meta.id];
        if (thr == null) return;
        const sc = scene(meta.id);
        const raw = sc.passes.map((p, j) => { const s = sc.pass(j).segments.find((z) => z.id === sc.key); return { t: p.ts, v: s.metric.value, pass: p.id }; });
        sc.passes.forEach((p, j) => {
          const s = sc.pass(j).segments.find((z) => z.id === sc.key);
          if (typeof s.metric.delta === 'number' && Math.abs(s.metric.delta) >= thr) {
            out.push({ id: meta.id + ':' + j, t: p.ts, sym: meta.linked[0], site: meta.id, segId: s.id, pass: j,
              label: meta.short + ' ' + s.metric.name.toLowerCase() + ' ' + TT.fmt.delta(s.metric.delta, s.metric.digits == null ? 1 : s.metric.digits) + (s.metric.deltaUnit ? ' ' + s.metric.deltaUnit.trim() : ''),
              rule: s.rule + ' Overlay threshold: single-pass change of ' + thr + (s.metric.deltaUnit ? ' ' + s.metric.deltaUnit.trim() : '') + ' or more.', metric: s.metric.name, unit: s.metric.unit, conf: s.conf, raw: raw });
          }
        });
      });
      return out;
    }

    function passPayload(sc, i) {
      const p = sc.passes[i];
      const data = sc.pass(i);
      return { id: p.id, i: i, ts: p.ts, sensor: cfg.sensorLabel || 'SAT VHR', gsd: sc.meta.gsd, model: TT.mock.scenes.MODEL, imageUrl: null,
        scene: { siteId: sc.meta.id, w: TT.mock.scenes.W, h: TT.mock.scenes.H, static: sc.static, items: data.items }, segments: data.segments };
    }

    const api = {
      async watchlist(o) {
        await lat(30, 80); guard();
        const now = Date.now(); market.advance(now);
        const syms = (o && o.symbols && o.symbols.length) ? o.symbols : D.defaultWatchlist;
        return { asOf: now, source: 'scaffold feed', quotes: market.quotes(syms) };
      },
      async macro(o) {
        await lat(60, 140); guard();
        const tf = (o && o.tf) || '1D';
        const now = Date.now(); market.advance(now);
        const kpis = D.kpiMap.map((k) => {
          const s = market.series(k.sym, tf, now); const q = market.quote(k.sym);
          const first = s[0][1], last = s[s.length - 1][1];
          return { slot: k.slot, sym: k.sym, name: q.name, kind: q.kind, value: q.px, chg: last - first, chgPct: last / first - 1, tf: tf };
        });
        const series = D.kpiMap.map((k) => { const q = market.quote(k.sym); return { id: k.sym, name: q.name, kind: q.kind, points: market.series(k.sym, tf, now) }; });
        return { asOf: now, source: 'scaffold feed', tf: tf, kpis: kpis, series: series, signals: signals() };
      },
      async imagery(o) {
        await lat(160, 280); guard();
        const sc = scene(o && o.site);
        if (!sc) throw new Error('Unknown site');
        let i = sc.passes.length - 1;
        if (o.pass != null) { const f = sc.passes.findIndex((p) => p.id === o.pass || p.i === Number(o.pass)); if (f >= 0) i = f; }
        const res = { asOf: Date.now(), site: Object.assign({ key: sc.key }, sc.meta), passes: sc.passes.map((p) => ({ id: p.id, i: p.i, ts: p.ts })), pass: passPayload(sc, i), prior: i > 0 ? passPayload(sc, i - 1) : null };
        return res;
      },
      async ask(o) {
        const signal = o && o.signal;
        await TT.sleep(650 + Math.random() * 400, signal);
        if (!feedUp) throw new Error('Agent unreachable');
        const ans = TT.mock.agent(M, o.prompt, o.context || {});
        const parts = ans.text.match(/\S+\s*/g) || [];
        let acc = '';
        for (let k = 0; k < parts.length; k += 2) {
          if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
          const chunk = parts.slice(k, k + 2).join('');
          acc += chunk;
          if (o.onToken) o.onToken(chunk, acc);
          await TT.sleep(16, signal);
        }
        ctxUsed = Math.min(CTX_MAX, ctxUsed + Math.round((o.prompt.length + ans.text.length) / 4) + 2600);
        return ans;
      },
      async sites() {
        await lat(40, 90); guard();
        return { asOf: Date.now(), sites: D.sites.map((meta) => {
          const sc = scene(meta.id); const i = sc.passes.length - 1; const data = sc.pass(i); const k = data.segments.find((s) => s.id === sc.key);
          const keySeries = sc.passes.map((p, j) => ({ t: p.ts, v: sc.pass(j).segments.find((s) => s.id === sc.key).metric.value }));
          return Object.assign({}, meta, { key: sc.key, latestPass: sc.passes[i].ts, passCount: sc.passes.length, segments: data.segments.length, keyLabel: k.label.split(' · ')[0], keyMetric: k.metric, keyConf: k.conf, keySeries: keySeries });
        }) };
      },
      async quotes(o) {
        await lat(40, 110); guard();
        const now = Date.now(); market.advance(now);
        return { asOf: now, source: 'scaffold feed', kind: o.kind, rows: market.table(o.kind) };
      },
      async series(o) {
        await lat(40, 90); guard();
        const now = Date.now();
        if (market.quote(o.sym)) { const q = market.quote(o.sym); return { asOf: now, sym: o.sym, name: q.name, kind: q.kind, points: market.series(o.sym, '1D', now) }; }
        const r = market.rowSeries(o.sym, now);
        if (!r) throw new Error('Unknown symbol');
        return Object.assign({ asOf: now }, r);
      },
      async flow() { await lat(50, 120); guard(); return market.flow(Date.now()); },
      async wire() {
        await lat(30, 80); guard();
        const now = Date.now(); releaseWire(now);
        return { asOf: now, source: 'scaffold wire', items: wire.slice().sort((a, b) => b.ts - a.ts).slice(0, 40) };
      },
      async events(o) {
        await lat(20, 60); guard();
        const now = Date.now(); release(now);
        const since = (o && o.since) || 0;
        return { asOf: now, events: events.filter((e) => e.seq > since) };
      },
      async system() {
        await lat(20, 60);
        const j = (a, b) => Math.round(a + Math.random() * (b - a));
        return { asOf: Date.now(), mode: 'scaffold', feed: feedUp,
          models: [
            { name: 'SAM 3.1', role: 'segmentation', where: 'cloud', status: feedUp ? 'ok' : 'down', latencyMs: j(160, 240) },
            { name: 'Spark 1.3', role: 'reasoning', where: 'cloud', status: feedUp ? 'ok' : 'down', latencyMs: j(380, 520) },
            { name: 'Glimmer 30B', role: 'local agent', where: 'local', status: 'ok', latencyMs: j(28, 52) },
          ],
          context: { used: ctxUsed, max: CTX_MAX },
          sourcesFused: D.instruments.length + D.sites.length + 2 + 2,
        };
      },
    };
    api.__debug = {
      feed(up) { feedUp = !!up; return feedUp; },
      setContext(n) { ctxUsed = Math.max(0, Math.min(CTX_MAX, n)); return ctxUsed; },
      fireScheduled() { scheduled.forEach((s) => { s.at = Math.min(s.at, Date.now()); }); },
      fireWire() { wireNext = Date.now(); },
      world: M,
    };
    return api;
  };
})();
