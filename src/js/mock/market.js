/* Scaffold market simulation: quotes, histories for 1D/1W/1M/1Y, futures and FX tables, capital flow. */
(function () {
  'use strict';
  const TT = window.TT;
  const D = () => TT.mock.data;
  const MIN = 60000, HOUR = 3600000, DAY = 86400000;
  const TICK_MS = 500;

  function bridge(rnd, from, to, n, sigma, additive) {
    // Random walk of n points from `from` to `to`, pinned at both ends.
    const w = [0];
    for (let k = 1; k < n; k++) w.push(w[k - 1] + TT.gauss(rnd) * sigma);
    const end = w[n - 1];
    return w.map((v, k) => {
      const t = n > 1 ? k / (n - 1) : 1;
      const dev = v - end * t;
      if (additive) return from + (to - from) * t + dev;
      return Math.exp(Math.log(from) + (Math.log(to) - Math.log(from)) * t + dev);
    });
  }

  TT.mock.Market = function (opts) {
    const boot = opts.bootTs;
    const demo = !!opts.demo;
    const rnd = TT.rng(opts.seed || 7);
    const inst = new Map();
    let lastStep = boot;

    // Group B fill deltas drive CL1 daily returns so the agent's correlation is computed, not asserted.
    const seg = TT.mock.scenes.get('ela-segundo-tanks', boot);
    const histB = seg.history.groupB;
    const fillDeltas = histB.slice(1).map((v, k) => v - histB[k]); // 29 deltas, last = latest pass

    D().instruments.forEach((src) => {
      const q = Object.assign({}, src);
      q.anchor = q.px;
      q.open = q.prev + (q.px - q.prev) * 0.25;
      q.hi = Math.max(q.px, q.open, q.prev) * (q.kind === 'yield' ? 1 : 1.0012);
      q.lo = Math.min(q.px, q.open, q.prev) * (q.kind === 'yield' ? 1 : 0.9988);
      if (q.kind === 'yield') { q.hi = Math.max(q.px, q.prev) + 0.008; q.lo = Math.min(q.px, q.prev) - 0.006; }
      q.ts = boot;
      const additive = q.kind === 'yield';
      const dSig = additive ? 0.045 : q.vol / Math.sqrt(252);
      const r = TT.rng(TT.hash(q.sym));
      // daily closes ending at prev (yesterday), 260 trading days
      const daily = [q.prev];
      let dayTs = boot - DAY;
      for (let k = 1; k < 260; k++) {
        let ret;
        if (q.sym === 'CL1' && k <= 28) ret = -0.003 * fillDeltas[fillDeltas.length - 1 - k] + TT.gauss(r) * 0.006;
        else ret = TT.gauss(r) * dSig;
        const prevClose = additive ? daily[0] - ret : daily[0] / Math.exp(ret);
        daily.unshift(prevClose);
      }
      q.daily = daily.map((v, k) => [dayTs - (daily.length - 1 - k) * DAY, v]);
      // weekly hourly path from 5 closes ago to now
      const wFrom = daily[daily.length - 5];
      q.week = bridge(r, wFrom, q.px, 7 * 24 + 1, additive ? 0.006 : dSig / 5, additive).map((v, k) => [boot - (7 * 24 - k) * HOUR, v]);
      // intraday 5-minute path from prev to now
      q.intra = bridge(r, q.prev, q.px, 289, additive ? 0.0015 : dSig / 19, additive).map((v, k) => [boot - (288 - k) * 5 * MIN, v]);
      inst.set(q.sym, q);
    });

    function moveQuote(q, step) {
      const additive = q.kind === 'yield';
      if (demo && q.sym === 'CL1') return false;
      const amp = demo ? 0.6 : 1;
      if (additive) q.px = q.px + TT.gauss(rnd) * 0.0006 * amp + (q.anchor - q.px) * 0.02;
      else {
        const sig = q.vol * Math.sqrt(TICK_MS / (252 * 6.5 * 3600 * 1000)) * 2.5 * amp;
        q.px = q.px * Math.exp(TT.gauss(rnd) * sig) + (q.anchor - q.px) * 0.02;
      }
      q.hi = Math.max(q.hi, q.px); q.lo = Math.min(q.lo, q.px);
      q.ts = step;
      return true;
    }

    function updateSeries(q, now) {
      const lastI = q.intra[q.intra.length - 1];
      if (now - lastI[0] >= 5 * MIN) q.intra.push([now, q.px]); else lastI[1] = q.px;
      const lastW = q.week[q.week.length - 1];
      if (now - lastW[0] >= HOUR) q.week.push([now, q.px]); else lastW[1] = q.px;
    }

    function advance(now) {
      let steps = Math.floor((now - lastStep) / TICK_MS);
      if (steps <= 0) return;
      steps = Math.min(steps, 12);
      for (let s = 0; s < steps; s++) {
        lastStep += TICK_MS;
        inst.forEach((q) => { if (rnd() < 0.35) moveQuote(q, lastStep); });
      }
      lastStep = Math.max(lastStep, now - TICK_MS);
      inst.forEach((q) => updateSeries(q, now));
      advanceTables(now);
    }

    function view(q) {
      const chg = q.px - q.prev;
      return { sym: q.sym, name: q.name, kind: q.kind, px: q.px, prev: q.prev, chg: chg, chgPct: chg / q.prev, hi: q.hi, lo: q.lo, open: q.open, ts: q.ts, spark: q.intra.slice(-48).map((p) => p[1]) };
    }

    function series(sym, tf, now) {
      const q = inst.get(sym);
      if (!q) return [];
      if (tf === '1D') return q.intra.filter((p) => p[0] >= now - DAY - 5 * MIN);
      if (tf === '1W') return q.week.filter((p) => p[0] >= now - 7 * DAY - HOUR);
      const live = [now, q.px];
      if (tf === '1M') return q.daily.slice(-22).concat([live]);
      return q.daily.slice(-252).concat([live]);
    }

    /* ---------- tables ---------- */
    const tables = { commodities: [], fx: [] };
    const tr = TT.rng(TT.hash('tables'));
    D().products.forEach((p) => {
      const [code, pname, base, vol, spread, link] = p;
      const productRet = TT.gauss(tr) * vol / Math.sqrt(252);
      for (let m = 0; m < 8; m++) {
        const mi = (11 + m) % 12, yr = 26 + Math.floor((11 + m) / 12);
        const px = base + spread * m;
        const prev = px * (1 - productRet * (1 - m * 0.04) - TT.gauss(tr) * vol / Math.sqrt(252) * 0.15);
        const row = { sym: code + D().monthCodes[mi] + String(yr).slice(-1), name: pname + ' ' + D().monthNames[mi] + ' ' + yr, product: code, kind: 'commodity', px: px, prev: prev, vol: vol,
          volume: Math.round((8 - m) * (800 + tr() * 9000)), oi: Math.round((9 - m) * (4000 + tr() * 40000)), link: m === 0 ? link : null, spreadFromLink: 0 };
        tables.commodities.push(row);
      }
    });
    const cur = D().currencies;
    const rate = Object.fromEntries(cur);
    const pairs = [];
    const add = (b, q) => { const s = b + q; if (b !== q && !pairs.includes(s) && !pairs.includes(q + b)) pairs.push(s); };
    [['EUR', 'USD'], ['USD', 'JPY'], ['GBP', 'USD'], ['USD', 'CHF'], ['AUD', 'USD'], ['USD', 'CAD'], ['NZD', 'USD']].forEach(([b, q]) => add(b, q));
    cur.forEach(([c]) => add('USD', c));
    ['EUR', 'GBP', 'JPY', 'AUD', 'CHF', 'CAD', 'NZD', 'SEK', 'NOK'].forEach((b) => cur.forEach(([c]) => { if (pairs.length < 200) add(b, c); }));
    pairs.slice(0, 200).forEach((s) => {
      const b = s.slice(0, 3), q = s.slice(3);
      const px = rate[q] / rate[b];
      const vol = ['TRY', 'BRL', 'ZAR', 'MXN', 'COP', 'CLP'].includes(b) || ['TRY', 'BRL', 'ZAR', 'MXN', 'COP', 'CLP'].includes(q) ? 0.14 : 0.08;
      const prev = px * (1 - TT.gauss(tr) * vol / Math.sqrt(252));
      tables.fx.push({ sym: s, name: b + '/' + q, product: b, kind: 'fx', px: px, prev: prev, vol: vol, volume: Math.round(200 + tr() * 9000), oi: null, link: s === 'EURUSD' || s === 'USDJPY' ? s : null });
    });
    [tables.commodities, tables.fx].forEach((list) => list.forEach((row) => {
      const r = TT.rng(TT.hash(row.sym));
      if (row.link && inst.get(row.link)) { const lq = inst.get(row.link); row.px = lq.px; row.prev = lq.prev; }
      row.spark = bridge(r, row.prev, row.px, 30, row.vol / 60, false);
      row.hi = Math.max.apply(null, row.spark); row.lo = Math.min.apply(null, row.spark);
      row.ts = boot; row.sparkTs = boot;
    }));
    let lastTable = boot;
    function advanceTables(now) {
      if (now - lastTable < 1000) return;
      lastTable = now;
      ['commodities', 'fx'].forEach((k) => tables[k].forEach((row) => {
        if (row.link && inst.get(row.link)) { const lq = inst.get(row.link); if (lq.px !== row.px) { row.px = lq.px; row.ts = now; } }
        else if (rnd() < 0.12) {
          if (!(demo && row.product === 'CL')) {
            row.px = row.px * Math.exp(TT.gauss(rnd) * row.vol * 0.0009);
            row.ts = now;
          }
        }
        row.hi = Math.max(row.hi, row.px); row.lo = Math.min(row.lo, row.px);
        if (now - row.sparkTs >= 60000) { row.spark.shift(); row.spark.push(row.px); row.sparkTs = now; } else row.spark[row.spark.length - 1] = row.px;
      }));
    }
    function tableView(kind) {
      return tables[kind].map((r, k) => ({ ord: k, sym: r.sym, name: r.name, product: r.product, kind: r.kind, px: r.px, prev: r.prev, chg: r.px - r.prev, chgPct: (r.px - r.prev) / r.prev, hi: r.hi, lo: r.lo, volume: r.volume, oi: r.oi, spark: r.spark.slice(), ts: r.ts }));
    }
    function rowSeries(sym, now) {
      const all = tables.commodities.concat(tables.fx);
      const row = all.find((r) => r.sym === sym);
      if (!row) return null;
      const r = TT.rng(TT.hash(sym + 'intra'));
      const pts = bridge(r, row.prev, row.px, 97, row.vol / 70, false);
      return { sym: sym, name: row.name, kind: row.kind, points: pts.map((v, k) => [now - (96 - k) * 15 * MIN, v]) };
    }

    /* ---------- capital flow ---------- */
    function flow(now) {
      const cats = D().flowCats;
      const base = { Equities: 820, Energy: 410, Metals: 260, Rates: 640, FX: 520 };
      const end = Math.floor(now / HOUR) * HOUR;
      const t = Array.from({ length: 72 }, (_, k) => end - (71 - k) * HOUR);
      const s = {};
      cats.forEach((c) => {
        const r = TT.rng(TT.hash('flow' + c + Math.floor(boot / HOUR)));
        s[c] = t.map((ts, k) => {
          const h = new Date(ts).getUTCHours();
          const diurnal = h >= 13 && h <= 21 ? 1.25 + 0.35 * Math.sin(((h - 13) / 8) * Math.PI) : h >= 7 && h < 13 ? 0.95 : 0.55;
          let v = base[c] * diurnal * (1 + TT.gauss(r) * 0.11);
          if (c === 'Energy' && k >= 64) v *= 1 + (k - 63) * 0.11;
          if (c === 'Metals' && k >= 66) v *= 1.12;
          return Math.max(20, TT.round(v, 1));
        });
      });
      return { asOf: now, source: 'scaffold flow model', unit: 'USD mm', categories: cats, t: t, series: s };
    }

    return {
      advance: advance,
      quote(sym) { const q = inst.get(sym); return q ? view(q) : null; },
      quotes(syms) { return syms.map((s) => (inst.get(s) ? view(inst.get(s)) : tableQuote(s))).filter(Boolean); },
      series: series,
      instruments() { return Array.from(inst.values()).map(view); },
      table: tableView,
      rowSeries: rowSeries,
      flow: flow,
      realizedVol(sym) {
        const q = inst.get(sym);
        const d = q.daily.slice(-22).map((p) => p[1]);
        const rets = d.slice(1).map((v, k) => Math.log(v / d[k]));
        const m = rets.reduce((a, b) => a + b, 0) / rets.length;
        const sd = Math.sqrt(rets.reduce((a, b) => a + (b - m) * (b - m), 0) / (rets.length - 1));
        return sd * Math.sqrt(252);
      },
      dailyReturns(sym, n) {
        const q = inst.get(sym);
        const d = q.daily.map((p) => p[1]).concat([q.px]);
        const rets = d.slice(1).map((v, k) => v / d[k] - 1);
        return rets.slice(-n);
      },
      fillDeltas: fillDeltas,
    };

    function tableQuote(sym) {
      const all = tables.commodities.concat(tables.fx);
      const r = all.find((x) => x.sym === sym);
      if (!r) return null;
      return { sym: r.sym, name: r.name, kind: r.kind, px: r.px, prev: r.prev, chg: r.px - r.prev, chgPct: (r.px - r.prev) / r.prev, hi: r.hi, lo: r.lo, ts: r.ts, spark: r.spark.slice() };
    }
  };
})();
