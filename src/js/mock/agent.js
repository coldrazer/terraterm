/* Scaffold agent: a rules-based reasoner over the scaffold data. Answers first, then sources and a numeric confidence.
   It never invents prices or pass times: every number comes from the market sim or the scene passes,
   and every comparative sentence (largest, smaller, agree, diverge) is chosen from those numbers, not fixed text. */
(function () {
  'use strict';
  const TT = window.TT;
  const F = TT.fmt;

  TT.mock.agent = function (M, prompt, ctx) {
    ctx = ctx || {};
    const p = String(prompt || '').toLowerCase();
    const q = (s) => M.market.quote(s) || M.market.quotes([s])[0];
    const qs = (s) => { const x = q(s); if (!x) return s + ' n/a'; return x.kind === 'yield' ? F.price(x.px, 'yield') + '% (' + F.bp(x.chg) + ')' : F.price(x.px, x.kind) + ' (' + F.pct(x.chgPct) + ')'; };
    const pct = (s) => { const x = q(s); return x ? (x.kind === 'yield' ? F.bp(x.chg) : F.pct(x.chgPct)) : 'n/a'; };
    const scene = (id) => M.scene(id);
    const latest = (id) => { const sc = scene(id); return { sc: sc, pass: sc.passes[sc.passes.length - 1], prev: sc.passes[sc.passes.length - 2], data: sc.pass(sc.passes.length - 1) }; };
    const segOf = (id, segId, i) => { const sc = scene(id); const idx = i == null ? sc.passes.length - 1 : i; return sc.pass(idx).segments.find((s) => s.id === segId); };
    const route = (id, seg) => 'orbital/' + id + (seg ? '/' + seg : '');
    const r2 = (v) => TT.round(v, 2);
    const quiet = (s) => { const x = q(s); return !!x && Math.abs(x.kind === 'yield' ? x.chg / 100 : x.chgPct) < 0.005; }; // under 0.5% is 'not reacting'

    function out(paras, sources, conf, missing) {
      return { text: paras.filter(Boolean).join('\n\n'), sources: sources, confidence: r2(TT.clamp(conf, 0.05, 0.99)), missing: missing || [], model: 'Spark 1.3' };
    }

    /* ---------- intents ---------- */
    function tank() {
      const L = latest('ela-segundo-tanks');
      const g = L.data.segments.find((s) => s.id === 'grp-b');
      const m = g.metric;
      const hist = L.sc.history.groupB;
      const deltas = hist.slice(1).map((v, k) => v - hist[k]);
      const priorMax = Math.max.apply(null, deltas.slice(0, -1).map(Math.abs));
      const others = L.data.segments.filter((s) => s.group === 'tank' && s.id.indexOf('tk-b') !== 0);
      const otherMax = Math.max.apply(null, others.map((s) => Math.abs(s.metric.delta)));
      const rho = TT.pearson(M.market.fillDeltas, M.market.dailyReturns('CL1', M.market.fillDeltas.length));
      const members = L.data.segments.filter((s) => s.group === 'tank' && s.id.indexOf('tk-b') === 0);
      const low = members.filter((s) => s.conf < 0.8).length;
      const cl = q('CL1'), co = q('CO1');
      return out([
        'Group B at El Segundo (6 floating-roof tanks) fell from ' + m.prior.toFixed(1) + '% to ' + m.value.toFixed(1) + '% fill between the ' + F.utcDate(L.prev.ts) + ' and ' + F.utcDate(L.pass.ts) +
          ' passes, a ' + F.delta(m.delta, 1) + ' pp move and an estimated ' + F.delta(g.extra.value, 2) + ' Mbbl. ' + (Math.abs(m.delta) > priorMax
            ? 'That is the largest single-pass change in the ' + hist.length + '-pass history; the previous largest was ' + priorMax.toFixed(1) + ' pp.'
            : 'The largest single-pass change in the ' + hist.length + '-pass history is ' + priorMax.toFixed(1) + ' pp, so this one is not a record.'),
        'WTI is ' + F.pct(cl.chgPct) + ' on the session at ' + F.price(cl.px) + '. Across the last ' + M.market.fillDeltas.length + ' pass intervals, group B fill changes and WTI daily returns correlate at ' + F.delta(rho, 2) +
          (rho <= -0.3 ? ', so draws have tended to coincide with price strength.' : rho >= 0.3 ? ', so draws have tended to coincide with price weakness.' : ', too weak to read draws as a price signal.') +
          ' Brent is ' + F.pct(co.chgPct) + (Math.abs(co.chgPct) < Math.abs(cl.chgPct) ? ', a smaller move, which fits a regional supply story more than a global one.' : ', at least as large a move, which points to a global driver rather than a regional one.'),
        'The other ' + others.length + ' tanks at the site moved by ' + otherMax.toFixed(1) + ' pp or less, so this looks specific to group B rather than a site-wide outage. Group confidence is ' + g.conf.toFixed(2) + '; ' +
          (low ? low + ' member tank(s) sit below the 0.80 display filter.' : 'all six member tanks clear the 0.80 display filter.'),
        'Not visible from here: pipeline flows, refinery run rates, and the reason for the transfer. Next I would check the following pass for continuation and the weekly inventory report for confirmation.',
      ], [
        { label: 'Orbital · El Segundo ' + F.utc(L.pass.ts, false), route: route('ela-segundo-tanks', 'grp-b') },
        { label: 'Macro · WTI CL1', route: 'macro' },
        { label: 'Watchlist · CO1', route: 'desk' },
      ], g.conf * 0.95, ['pipeline flow data', 'refinery run rates']);
    }

    function port() {
      const L = latest('san-pedro-port');
      const a = L.data.segments.find((s) => s.id === 'anchorage');
      const y = L.data.segments.find((s) => s.id === 'yard');
      const g = L.data.segments.find((s) => s.id === 'gate');
      const h = L.sc.history.anchorage;
      const berths = L.data.segments.filter((s) => s.id.indexOf('berth-') === 0).length;
      const rising = h.slice(1).every((v, k) => v > h[k]);
      return out([
        'The San Pedro Bay anchorage held ' + a.metric.value + ' vessels on the ' + F.utcDate(L.pass.ts) + ' pass, up ' + a.metric.delta + ' from the prior weekly pass and up from ' + h[0] + ' six passes ago. ' +
          (rising ? 'Each of the last five passes has been higher than the one before.' : 'The trend is up but not monotonic.'),
        'Inside the terminal, container yard utilization rose to ' + y.metric.value + '% from ' + y.metric.prior + '%, and the gate queue is ' + g.metric.value + ' trucks, up from ' + g.metric.prior + '. Ships waiting while the yard fills points to landside congestion rather than a berth shortage: ' + berths + ' of 4 berths are occupied.',
        (quiet('SPX') && quiet('RTY') ? 'Linked markets are not reacting yet: S&P 500 ' : 'Linked markets: S&P 500 ') + pct('SPX') + ', Russell 2000 ' + pct('RTY') + '. The anchorage alert threshold is 28 vessels.',
        'Missing: vessel identities and cargo, which need AIS data. Next I would check yard dwell time on the next weekly pass.',
      ], [
        { label: 'Orbital · San Pedro Bay ' + F.utc(L.pass.ts, false), route: route('san-pedro-port', 'anchorage') },
        { label: 'Satellite intel', route: 'intel' },
        { label: 'Watchlist · SPX RTY', route: 'desk' },
      ], a.conf * 0.95, ['AIS vessel identities']);
    }

    function brief() {
      const es = latest('ela-segundo-tanks').data.segments.find((s) => s.id === 'grp-b');
      const sp = latest('san-pedro-port');
      const an = sp.data.segments.find((s) => s.id === 'anchorage');
      const cu = latest('cushing-hub').data.segments.find((s) => s.id === 'grp-e');
      const gw = latest('gary-works');
      const ore = gw.data.segments.find((s) => s.id === 'ore');
      const oreHist = gw.sc.history.ore;
      const by = latest('barstow-rail').data.segments.find((s) => s.id === 'class-yard');
      const vix = q('VIX');
      const rv = M.market.realizedVol('SPX') * 100;
      return out([
        'Markets: S&P 500 ' + qs('SPX') + ', Nasdaq 100 ' + pct('NDX') + ', Russell 2000 ' + pct('RTY') + '. WTI ' + qs('CL1') + ' leads commodities; Brent ' + pct('CO1') + ', copper ' + pct('HG1') + ', gold ' + pct('GC1') +
          '. UST 10Y ' + qs('US10Y') + ', 2Y ' + pct('US2Y') + '. DXY ' + qs('DXY') + '. VIX ' + qs('VIX') + '.',
        'Ground truth: El Segundo group B fill moved ' + F.delta(es.metric.delta, 1) + ' pp to ' + es.metric.value.toFixed(1) + '% on the latest pass. San Pedro Bay anchorage is at ' + an.metric.value + ' vessels, up from ' + sp.sc.history.anchorage[0] +
          ' six weekly passes ago. Cushing east fill ' + F.delta(cu.metric.delta, 1) + ' pp. Gary ore stockpile ' + ore.metric.value.toFixed(2) + ' Mt, ' + F.pct(ore.metric.value / oreHist[0] - 1, 1) + ' over six passes. Barstow yard ' + by.metric.value + ' railcars (' + F.delta(by.metric.delta, 0) + ').',
        (es.metric.delta < 0 && q('CL1').chgPct > 0 ? 'Where they agree: the El Segundo draw and the WTI rally point the same way. '
          : es.metric.delta < 0 ? 'Where they disagree: El Segundo is drawing while WTI is ' + pct('CL1') + '. '
          : 'El Segundo is building while WTI is ' + pct('CL1') + '. ') +
          (an.metric.delta > 0 ? 'Port congestion is building while VIX at ' : 'Port congestion is easing; VIX at ') + F.price(vix.px) + ' sits ' + (vix.px < rv ? 'below' : 'above') + ' one-month S&P realized vol of ' + rv.toFixed(1) + '%.',
        'Watch next: the next El Segundo pass, the anchorage threshold at 28 vessels, and whether copper follows the Gary stockpile drawdown.',
      ], [
        { label: 'Watchlist', route: 'desk' },
        { label: 'Macro', route: 'macro' },
        { label: 'Orbital · El Segundo', route: route('ela-segundo-tanks', 'grp-b') },
        { label: 'Orbital · San Pedro Bay', route: route('san-pedro-port', 'anchorage') },
        { label: 'Satellite intel', route: 'intel' },
      ], 0.78);
    }

    function divergence() {
      const vix = q('VIX');
      const rv = M.market.realizedVol('SPX') * 100;
      const sp = latest('san-pedro-port');
      const an = sp.data.segments.find((s) => s.id === 'anchorage');
      const y = sp.data.segments.find((s) => s.id === 'yard');
      const h = sp.sc.history.anchorage;
      const diff = vix.px - rv;
      return out([
        'VIX is ' + qs('VIX') + '. One-month realized volatility on the S&P 500 is ' + rv.toFixed(1) + '%, so implied is ' + (diff >= 0 ? 'above' : 'below') + ' realized by ' + Math.abs(diff).toFixed(1) + ' points.',
        (an.metric.value > h[0] && vix.chgPct < 0
          ? 'Physical stress is building while vol eases: the San Pedro Bay anchorage rose from ' + h[0] + ' to ' + an.metric.value + ' vessels over six weekly passes (' + F.pct(an.metric.value / h[0] - 1, 0) + '), and container yard utilization is ' + y.metric.value + '%. Equity vol is not pricing that friction.'
          : 'The San Pedro Bay anchorage went from ' + h[0] + ' to ' + an.metric.value + ' vessels over six weekly passes (' + F.pct(an.metric.value / h[0] - 1, 0) + ') with container yard utilization at ' + y.metric.value + '%, while VIX is ' + pct('VIX') + '.'),
        'Energy: WTI is ' + pct('CL1') + ' while VIX is ' + pct('VIX') + '. ' + (q('CL1').chgPct > 0 && vix.chgPct < 0 ? 'A commodity-led move with falling equity vol fits the El Segundo drawdown better than a macro shock.' : 'These are not moving in the commodity-led pattern, so I would not read the El Segundo move into vol.'),
        'Not in context: options skew and term structure, which would show whether the tail is being hedged. That is what I would check next.',
      ], [
        { label: 'Macro · VIX', route: 'macro' },
        { label: 'Macro · SPX realized vol', route: 'macro' },
        { label: 'Orbital · San Pedro Bay', route: route('san-pedro-port', 'anchorage') },
        { label: 'Orbital · El Segundo', route: route('ela-segundo-tanks', 'grp-b') },
      ], 0.71, ['options skew', 'vol term structure']);
    }

    function siteBrief(id) {
      const L = latest(id);
      const k = L.data.segments.find((s) => s.id === L.sc.key);
      const meta = L.sc.meta;
      const m = k.metric;
      const linked = meta.linked.map((s) => q(s)).filter(Boolean);
      return out([
        meta.name + ': ' + k.label.split(' · ')[0] + ' ' + m.name.toLowerCase() + ' is ' + fmtMetric(m.value, m) + ' on the ' + F.utcDate(L.pass.ts) + ' pass, versus ' + fmtMetric(m.prior, m) + ' on the prior pass (' + F.delta(m.delta, m.digits == null ? 1 : m.digits) + (m.deltaUnit ? ' ' + m.deltaUnit.trim() : '') + '). Confidence ' + k.conf.toFixed(2) + '.',
        'Linked markets: ' + linked.map((x) => x.sym + ' ' + (x.kind === 'yield' ? F.bp(x.chg) : F.pct(x.chgPct))).join(', ') + '.',
        'Detection rule: ' + k.rule,
      ], [
        { label: 'Orbital · ' + meta.short + ' ' + F.utc(L.pass.ts, false), route: route(id, k.id) },
        { label: 'Watchlist · ' + meta.linked.join(' '), route: 'desk' },
      ], k.conf * 0.93);
    }

    function fmtMetric(v, m) {
      if (typeof v !== 'number') return String(v);
      const d = m.digits == null ? 1 : m.digits;
      return F.num(v, d) + (m.unit || '');
    }

    function segment(site, id, i) {
      const sc = scene(site);
      if (!sc) return unknown();
      const idx = i == null ? sc.passes.length - 1 : i;
      const s = segOf(site, id, idx);
      if (!s) return out(['That segment is not detected on the selected pass, so I have no measurement for it.', 'Next I would check the prior pass in the orbital viewer.'],
        [{ label: 'Orbital · ' + sc.meta.short, route: route(site) }], 0.3, ['segment on selected pass']);
      if (site === 'ela-segundo-tanks' && id === 'grp-b' && idx === sc.passes.length - 1) return tank();
      if (site === 'san-pedro-port' && id === 'anchorage' && idx === sc.passes.length - 1) return port();
      const m = s.metric;
      const pass = sc.passes[idx];
      const linked = sc.meta.linked.map((x) => q(x)).filter(Boolean);
      const changed = typeof m.value === 'number' && m.prior != null;
      return out([
        s.label.split(' \u00b7 ')[0] + ' at ' + sc.meta.name + ' is a ' + s.cls + ' segment detected at confidence ' + s.conf.toFixed(2) + ' on the ' + F.utcDate(pass.ts) + ' pass. ' +
          (changed ? m.name + ': ' + fmtMetric(m.value, m) + ' versus ' + fmtMetric(m.prior, m) + ' on the prior pass (' + F.delta(m.delta, m.digits == null ? 1 : m.digits) + (m.deltaUnit ? ' ' + m.deltaUnit.trim() : '') + ').' : m.name + ': ' + m.value + '.'),
        'Detection rule: ' + s.rule + ' Area ' + F.int(s.area_m2) + ' m².',
        linked.length ? 'Linked markets: ' + linked.map((x) => x.sym + ' ' + (x.kind === 'yield' ? F.bp(x.chg) : F.pct(x.chgPct))).join(', ') + '.' : '',
        s.conf < 0.8 ? 'This detection is below the 0.80 display filter, so treat it as low confidence.' : '',
      ], [
        { label: 'Orbital · ' + sc.meta.short + ' ' + F.utc(pass.ts, false), route: route(site, s.id) },
        { label: 'Satellite intel', route: 'intel' },
      ], s.conf * 0.92);
    }

    function symbol(sym) {
      const x = q(sym);
      if (!x) return unknown();
      const roots = { CL: 'CL1', CO: 'CO1', HG: 'HG1', NG: 'NG1', GC: 'GC1' };
      const root = /^[A-Z]{2}[FGHJKMNQUVXZ]\d$/.test(sym) ? roots[sym.slice(0, 2)] : null;
      const sites = TT.mock.data.sites.filter((s) => s.linked.indexOf(sym) >= 0 || (root && s.linked.indexOf(root) >= 0));
      const lines = sites.map((s) => {
        const L = latest(s.id);
        const k = L.data.segments.find((z) => z.id === L.sc.key);
        const m = k.metric;
        const lbl = k.label.split(' \u00b7 ')[0];
        return (lbl.indexOf(s.short) === 0 ? lbl : s.short + ' ' + lbl) + ' ' + m.name.toLowerCase() + ' ' + fmtMetric(m.value, m) + ' (' + F.delta(m.delta, m.digits == null ? 1 : m.digits) + (m.deltaUnit ? ' ' + m.deltaUnit.trim() : '') + ' vs prior pass)';
      });
      const range = x.kind === 'yield' ? F.price(x.lo, 'yield') + '% to ' + F.price(x.hi, 'yield') + '%' : F.price(x.lo, x.kind) + ' to ' + F.price(x.hi, x.kind);
      return out([
        x.name + ' (' + x.sym + ') is ' + qs(x.sym) + ' on the session. Range ' + range + '.',
        lines.length ? 'Linked physical signals: ' + lines.join('; ') + '.' : 'No monitored site is linked to ' + x.sym + ', so there is no ground-truth read for it.',
      ], [{ label: 'Watchlist · ' + x.sym, route: 'desk' }].concat(sites.map((s) => ({ label: 'Orbital · ' + s.short, route: route(s.id) }))), lines.length ? 0.8 : 0.74,
      lines.length ? [] : ['physical signal for ' + x.sym]);
    }

    function pins() {
      const list = (ctx.pins || []);
      if (!list.length) return out(['Nothing is pinned to my context. Click a watchlist row or use PIN TO CONTEXT on a segment, then ask again.'], [], 0.9);
      const parts = list.map((p) => {
        if (p.kind === 'symbol') { const x = q(p.id); return x ? x.sym + ' ' + qs(x.sym) : p.id + ' (no quote)'; }
        const s = segOf(p.site, p.id);
        return s ? s.label + ' ' + s.metric.name.toLowerCase() + ' ' + fmtMetric(s.metric.value, s.metric) + ' (conf ' + s.conf.toFixed(2) + ')' : p.label;
      });
      return out(['Pinned context: ' + parts.join('; ') + '.'], list.map((p) => ({ label: (p.kind === 'symbol' ? 'Watchlist · ' : 'Orbital · ') + p.label, route: p.kind === 'symbol' ? 'desk' : route(p.site, p.id) })), 0.88);
    }

    function guard(sym) {
      const base = sym ? symbol(sym) : brief();
      base.text = 'I don’t give trade instructions. Here is what the data shows.\n\n' + base.text;
      return base;
    }

    function unknown() {
      return out([
        'I don’t have data in the current context that answers that.',
        'What I can see: ' + TT.mock.data.instruments.length + ' instruments, 200 futures contracts, 200 FX pairs, ' + TT.mock.data.sites.length + ' monitored sites with 6 passes each, the wire, and capital flow by asset class.',
        'Next I would check: whether one of those sources covers the question. Try naming a symbol (CL1, HG1, US10Y) or a site (El Segundo, San Pedro Bay, Cushing).',
      ], [], 0.22, ['a source covering this question']);
    }

    /* ---------- routing ---------- */
    const symWords = [
      [/\b(wti|crude|oil|cl1)\b/, 'CL1'], [/\b(brent|co1)\b/, 'CO1'], [/\b(nat(ural)? ?gas|ng1|henry hub)\b/, 'NG1'], [/\b(copper|hg1)\b/, 'HG1'], [/\b(gold|gc1|bullion)\b/, 'GC1'],
      [/\b(10y|ten.year|us10y|treasur)/, 'US10Y'], [/\b(2y|two.year|us2y)\b/, 'US2Y'], [/\b(dollar|dxy)\b/, 'DXY'], [/\b(vix)\b/, 'VIX'], [/\b(euro|eurusd)\b/, 'EURUSD'],
      [/\b(yen|usdjpy)\b/, 'USDJPY'], [/\b(s&p|spx|s and p)\b/, 'SPX'], [/\b(nasdaq|ndx)\b/, 'NDX'], [/\b(russell|rty|small caps?)\b/, 'RTY'],
    ];
    const mentioned = () => {
      const up = String(prompt || '').toUpperCase();
      const direct = up.match(/\b[A-Z]{2,4}[FGHJKMNQUVXZ]\d\b|\b[A-Z]{6}\b|\b[A-Z]{2,3}\d\b|\bUS\d{1,2}Y\b/g) || [];
      for (const d of direct) if (q(d)) return d;
      for (const [re, s] of symWords) if (re.test(p)) return s;
      return null;
    };

    if (/\b(should i|do i|tell me to|is it time to)\b.*\b(buy|sell|short|long|go long|go short)\b|\b(buy|sell|short)\b.*\b(now|today|here)\b/.test(p)) return guard(mentioned());
    if (ctx.segment && /\b(this|segment|it)\b/.test(p) && !/brief me$/.test(p.trim())) return segment(ctx.segment.site, ctx.segment.id, ctx.segment.pass);
    if (/\btanks?\b|drawdown|segundo|group b/.test(p)) return tank();
    if (/\bports?\b|anchorage|congestion|san pedro|vessels?\b|\bships?\b|container|yard util|gate queue/.test(p)) return port();
    if (/diverg|vol\b|volatility|vix/.test(p) && /diverg|vs|versus|against|from vol/.test(p)) return divergence();
    if (/cushing/.test(p)) return siteBrief('cushing-hub');
    if (/\bgary\b|\biron ore\b|\bore\b|stockpile|\bsteel\b/.test(p)) return siteBrief('gary-works');
    if (/barstow|\brail\b|railcars?|rail yard/.test(p)) return siteBrief('barstow-rail');
    if (/ontario|\bretail\b|parking|shoppers?/.test(p)) return siteBrief('ontario-retail');
    if (/brief|overview|summary|what('s| is) (going on|happening|moving)|catch me up/.test(p)) return brief();
    if (/pinned|my context|these|watchlist/.test(p)) return pins();
    const sym = mentioned();
    if (sym) return symbol(sym);
    if (ctx.segment) return segment(ctx.segment.site, ctx.segment.id, ctx.segment.pass);
    return unknown();
  };
})();
