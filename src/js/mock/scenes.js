/* Scaffold imagery scenes. Deterministic per site: static layout + 6 passes of dynamic objects + segments.
   A live backend replaces all of this with pass.imageUrl and its own segments. */
(function () {
  'use strict';
  const TT = window.TT;
  const W = 1600, H = 1000, PASSES = 6;
  const MODEL = 'SAM 3.1 · build 2026.10.14';

  const R = (rnd, a, b) => a + (b - a) * rnd();
  const RI = (rnd, a, b) => Math.floor(R(rnd, a, b + 1));
  const rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const rotRect = (cx, cy, len, beam, rot) => {
    const c = Math.cos(rot), s = Math.sin(rot), hl = len / 2, hb = beam / 2;
    return [[-hl, -hb], [hl, -hb], [hl, hb], [-hl, hb]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
  };
  const polyArea = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); };
  const nPoly = (pts) => ({ t: 'poly', pts: pts.map(([x, y]) => [x / W, y / H]) });
  const nCircle = (x, y, r) => ({ t: 'circle', cx: x / W, cy: y / H, r: r / W });
  const jitterConf = (base, siteId, segId, i) => TT.clamp(TT.round(base + (TT.rng(TT.hash(siteId + segId + i))() - 0.5) * 0.04, 2), 0.5, 0.99);
  const metric = (name, values, i, unit, digits, deltaUnit) => {
    const v = values[i + 1], p = values[i];
    return { name: name, value: v, prior: p, unit: unit, digits: digits, delta: TT.round(v - p, digits), deltaUnit: deltaUnit || unit };
  };
  // values arrays carry PASSES + 1 entries: index 0 is the pass before the oldest visible pass.

  function tankItems(tanks, fills) { return tanks.map((t, k) => ({ k: 'tank', x: t.x, y: t.y, r: t.r, fill: fills[k] })); }
  function tankSegs(meta, tanks, fillSeries, i, prefix) {
    return tanks.map((t, k) => ({
      id: t.id, cls: 'energy', label: t.label, hud: false,
      conf: jitterConf(t.conf, meta.id, t.id, i),
      geom: nCircle(t.x, t.y, t.r),
      area_m2: Math.PI * Math.pow(t.r * meta.gsd, 2),
      metric: metric('Fill', fillSeries[k], i, '%', 1, 'pp'),
      rule: 'Floating-roof shadow ratio converted to fill %. Shell height assumed 18 m.',
      group: prefix,
    }));
  }
  function capacityBbl(r, gsd) { return Math.PI * Math.pow(r * gsd, 2) * 18 * 6.2898; }
  function groupSeries(rnd, base, n, offset) { return Array.from({ length: n }, (_, j) => TT.round(base[j] + offset, 1)); }

  /* ======================= El Segundo tank farm ======================= */
  function elSegundo(meta) {
    const rnd = TT.rng(TT.hash(meta.id));
    const st = [];
    st.push({ k: 'ground', color: '#7b7366', alt: '#6c6458', seed: 11 });
    st.push({ k: 'berm', x: 40, y: 40, w: 500, h: 456 }, { k: 'berm', x: 604, y: 40, w: 560, h: 456 }, { k: 'berm', x: 40, y: 560, w: 500, h: 400 });
    st.push({ k: 'poly', pts: rectPts(604, 560, 560, 400), fill: '#6a6863' }, { k: 'poly', pts: rectPts(1228, 40, 352, 920), fill: '#66645f' });
    st.push({ k: 'road', pts: [[0, 528], [1600, 528]], w: 22 }, { k: 'road', pts: [[572, 0], [572, 1000]], w: 18 }, { k: 'road', pts: [[1196, 0], [1196, 1000]], w: 18 });
    st.push({ k: 'road', pts: [[1196, 860], [1600, 860]], w: 14 });
    st.push({ k: 'pipes', x: 604, y: 716, w: 560, n: 5, gap: 7 }, { k: 'pipes', x: 1228, y: 500, w: 352, n: 4, gap: 7 });
    st.push({ k: 'bldg', x: 640, y: 590, w: 150, h: 84, tone: '#b8b4ab', ht: 10 }, { k: 'bldg', x: 820, y: 600, w: 96, h: 64, tone: '#9f9a90', ht: 8 });
    st.push({ k: 'poly', pts: rectPts(970, 790, 170, 140), fill: '#47464a' });
    // refinery units on the right
    for (let j = 0; j < 6; j++) st.push({ k: 'column', x: 1280 + (j % 3) * 70, y: 120 + Math.floor(j / 3) * 90, r: 14 + (j % 2) * 5 });
    st.push({ k: 'bldg', x: 1250, y: 300, w: 300, h: 150, tone: '#8f8a80', ht: 14, detail: 'ridges' });
    st.push({ k: 'bldg', x: 1250, y: 600, w: 140, h: 220, tone: '#a7a297', ht: 12 }, { k: 'bldg', x: 1420, y: 620, w: 130, h: 180, tone: '#8c877d', ht: 10, detail: 'hvac' });
    st.push({ k: 'column', x: 1500, y: 930, r: 10 });

    const tanks = [];
    const add = (g, n, x, y, r) => tanks.push({ id: 'tk-' + g + n, label: 'TK-' + g.toUpperCase() + n, g: g, x: x, y: y, r: r, conf: TT.round(R(rnd, 0.79, 0.97), 2) });
    add('a', 1, 150, 152, 70); add('a', 2, 300, 152, 70); add('a', 3, 450, 152, 66); add('a', 4, 190, 360, 72); add('a', 5, 390, 360, 72);
    add('b', 1, 700, 162, 78); add('b', 2, 884, 162, 80); add('b', 3, 1068, 162, 76); add('b', 4, 700, 376, 80); add('b', 5, 884, 376, 78); add('b', 6, 1068, 376, 79);
    add('c', 1, 160, 680, 62); add('c', 2, 360, 680, 62); add('c', 3, 160, 860, 58); add('c', 4, 360, 860, 58);
    tanks[3].conf = 0.77; tanks[13].conf = 0.78; // two detections below the default 0.80 filter
    tanks.forEach((t) => st.push({ k: 'tankpad', x: t.x, y: t.y, r: t.r }));

    // Group averages: 30-pass history for group B, final 7 values drive the visible passes.
    const visB = [74.3, 72.4, 70.1, 68.8, 66.0, 61.2, 49.8];
    const histB = [];
    { const hr = TT.rng(TT.hash(meta.id + 'hist')); let v = 74.3; const pre = []; for (let j = 0; j < 23; j++) { v = TT.clamp(v + TT.clamp(TT.gauss(hr) * 1.1, -3, 3), 60, 86); pre.unshift(TT.round(v, 1)); } histB.push(...pre, ...visB); }
    const avg = { a: [55.0, 55.1, 55.4, 54.9, 55.3, 55.0, 55.2], b: visB, c: [38.4, 38.2, 38.0, 38.5, 38.1, 38.4, 38.3] };
    const offs = {};
    ['a', 'b', 'c'].forEach((g) => {
      const list = tanks.filter((t) => t.g === g);
      const o = list.map(() => R(rnd, -6, 6));
      const mean = o.reduce((s, v) => s + v, 0) / o.length;
      list.forEach((t, k) => { offs[t.id] = o[k] - mean; });
    });
    const fillSeries = tanks.map((t) => groupSeries(rnd, avg[t.g], PASSES + 1, offs[t.id]));
    const trucks = [3, 4, 3, 5, 4, 6, 7];
    const capB = tanks.filter((t) => t.g === 'b').reduce((s, t) => s + capacityBbl(t.r, meta.gsd), 0);

    function pass(i) {
      const prnd = TT.rng(TT.hash(meta.id + ':p' + i));
      const dyn = tankItems(tanks, fillSeries.map((s) => s[i + 1] / 100));
      const tpts = [];
      for (let j = 0; j < trucks[i + 1]; j++) tpts.push([990 + (j % 4) * 38, 815 + Math.floor(j / 4) * 58, Math.PI / 2 + (prnd() - 0.5) * 0.1]);
      dyn.push({ k: 'trucks', pts: tpts });
      const segs = tankSegs(meta, tanks, fillSeries, i, 'tank');
      const grp = (g, label, x, y, w, h, conf) => {
        const m = metric('Fill', avg[g], i, '%', 1, 'pp');
        const tag = m.delta <= -5 ? ' · DRAWDOWN' : m.delta >= 2 ? ' · BUILD' : '';
        const s = { id: 'grp-' + g, cls: 'energy', label: label + tag, hud: true, conf: conf, geom: nPoly(rectPts(x, y, w, h)), area_m2: w * h * meta.gsd * meta.gsd, metric: m,
          rule: 'Mean of member tank fills. Drawdown flag when the single-pass change is 5 pp or more.', members: tanks.filter((t) => t.g === g).map((t) => t.id) };
        if (g === 'b') s.extra = { name: 'Est. volume change', value: TT.round((m.delta / 100) * capB / 1e6, 2), unit: 'Mbbl' };
        return s;
      };
      segs.push(grp('a', 'TK GROUP A', 40, 40, 500, 456, jitterConf(0.92, meta.id, 'grp-a', i)));
      segs.push(grp('b', 'TK GROUP B', 604, 40, 560, 456, [0.88, 0.86, 0.9, 0.85, 0.89, 0.87][i]));
      segs.push(grp('c', 'TK GROUP C', 40, 560, 500, 400, jitterConf(0.9, meta.id, 'grp-c', i)));
      segs.push({ id: 'bay', cls: 'logistics', label: 'LOADING BAY', hud: true, conf: jitterConf(0.9, meta.id, 'bay', i), geom: nPoly(rectPts(970, 790, 170, 140)), area_m2: 170 * 140 * 0.25,
        metric: metric('Trucks', trucks, i, '', 0), rule: 'Count of tanker trucks detected inside the bay polygon.' });
      segs.push({ id: 'unit', cls: 'industrial', label: 'PROCESS UNIT', hud: true, conf: jitterConf(0.84, meta.id, 'unit', i), geom: nPoly(rectPts(1250, 300, 300, 150)), area_m2: 300 * 150 * 0.25,
        metric: { name: 'Status', value: 'Operating', unit: '', prior: 'Operating', delta: null }, rule: 'Building footprint with thermal and activity cues.' });
      return { items: dyn, segments: segs };
    }
    return { static: st, pass: pass, key: 'grp-b', history: { groupB: histB, capacityB: capB } };
  }

  /* ======================= San Pedro Bay port ======================= */
  function sanPedro(meta) {
    const rnd = TT.rng(TT.hash(meta.id));
    const st = [];
    st.push({ k: 'ground', color: '#77726a', alt: '#6e6a62', seed: 23 });
    st.push({ k: 'water', pts: [[880, 0], [1600, 0], [1600, 1000], [880, 1000]] });
    st.push({ k: 'breakwater', pts: [[1050, 90], [1066, 90], [1072, 840], [1056, 840]] });
    st.push({ k: 'poly', pts: rectPts(60, 30, 820, 950), fill: '#86837c' });
    st.push({ k: 'road', pts: [[60, 480], [880, 480]], w: 16 }, { k: 'road', pts: [[40, 30], [40, 1000]], w: 16 }, { k: 'road', pts: [[0, 480], [60, 480]], w: 16 });
    st.push({ k: 'road', pts: [[285, 30], [285, 980]], w: 12 }, { k: 'road', pts: [[60, 960], [880, 960]], w: 12 });
    st.push({ k: 'quay', x: 852, y: 0, w: 28, h: 1000 });
    const zones = [
      { id: 'yard-a', label: 'YARD A', x: 300, y: 60, w: 540, h: 400 },
      { id: 'yard-b', label: 'YARD B', x: 300, y: 505, w: 540, h: 440 },
      { id: 'yard-c', label: 'YARD C', x: 80, y: 60, w: 190, h: 400 },
      { id: 'yard-d', label: 'YARD D', x: 80, y: 505, w: 190, h: 440 },
    ];
    const blocks = [];
    zones.forEach((z) => {
      const bw = 124, bh = 24, gx = 10, gy = 10;
      const cols = Math.max(1, Math.floor((z.w + gx) / (bw + gx))), rows = Math.floor((z.h + gy) / (bh + gy));
      const ox = z.x + (z.w - (cols * (bw + gx) - gx)) / 2;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) blocks.push({ zone: z.id, x: ox + c * (bw + gx), y: z.y + r * (bh + gy), w: bw, h: bh, seed: TT.hash(z.id + r + ':' + c) });
    });
    for (let j = 0; j < 8; j++) st.push({ k: 'crane', x: 836, y: 70 + j * 118 });
    const anch = { x: 1100, y: 40, w: 480, h: 920 };
    const cells = [];
    for (let r = 0; r < 10; r++) for (let c = 0; c < 4; c++) cells.push([anch.x + 60 + c * 120 + R(rnd, -18, 18), anch.y + 46 + r * 92 + R(rnd, -14, 14)]);
    for (let j = cells.length - 1; j > 0; j--) { const k = Math.floor(rnd() * (j + 1)); const t = cells[j]; cells[j] = cells[k]; cells[k] = t; }
    const vessels = cells.map((c, k) => ({ id: 'vsl-' + String(k + 1).padStart(2, '0'), x: c[0], y: c[1], len: R(rnd, 72, 104), beam: R(rnd, 13, 18), rot: R(rnd, -0.5, -0.2), conf: TT.round(R(rnd, 0.76, 0.97), 2), tone: RI(rnd, 0, 3) }));
    const berths = [{ y: 190, len: 160 }, { y: 470, len: 150 }, { y: 760, len: 168 }, { y: 935, len: 84 }];
    const nAnch = [10, 12, 15, 18, 22, 27, 31];
    const util = [68, 71, 74, 77, 80, 84, 88];
    const gate = [6, 8, 11, 9, 14, 17, 22];
    const berthOcc = [[1, 1, 1, 0], [1, 1, 1, 1], [1, 1, 1, 0], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]];

    function pass(i) {
      const prnd = TT.rng(TT.hash(meta.id + ':p' + i));
      const dyn = [];
      dyn.push({ k: 'boxes', blocks: blocks, occ: util[i + 1] / 100 });
      const segs = [];
      berths.forEach((b, k) => {
        if (!berthOcc[i + 1][k]) return;
        const x = 852 + 28 + 14 + 2, y = b.y;
        dyn.push({ k: 'ship', x: x, y: y, len: b.len, beam: 26, rot: Math.PI / 2, tone: k % 3, moored: true });
        segs.push({ id: 'berth-' + (k + 1), cls: 'maritime', label: 'BERTH ' + (k + 1), hud: false, conf: jitterConf(0.95, meta.id, 'b' + k, i), geom: nPoly(rotRect(x, y, b.len, 26, Math.PI / 2)),
          area_m2: b.len * 26 * 2.25, metric: { name: 'Length', value: Math.round(b.len * meta.gsd), unit: ' m', prior: Math.round(b.len * meta.gsd), delta: 0, digits: 0 }, rule: 'Hull segmentation along the quay line.' });
      });
      const n = nAnch[i + 1];
      for (let k = 0; k < n; k++) {
        const v = vessels[k];
        const rot = v.rot + (prnd() - 0.5) * 0.12;
        dyn.push({ k: 'ship', x: v.x, y: v.y, len: v.len, beam: v.beam, rot: rot, tone: v.tone });
        segs.push({ id: v.id, cls: 'maritime', label: v.id.toUpperCase(), hud: false, conf: jitterConf(v.conf, meta.id, v.id, i), geom: nPoly(rotRect(v.x, v.y, v.len + 6, v.beam + 6, rot)),
          area_m2: v.len * v.beam * 2.25, metric: { name: 'Length', value: Math.round(v.len * meta.gsd), unit: ' m', prior: k < nAnch[i] ? Math.round(v.len * meta.gsd) : null, delta: k < nAnch[i] ? 0 : null, digits: 0 },
          rule: 'Vessel at anchor: hull outside berth polygons, speed below 0.5 kn across consecutive frames.', status: k < nAnch[i] ? 'Present in prior pass' : 'New since prior pass' });
      }
      const g = gate[i + 1];
      const tpts = [];
      for (let k = 0; k < g; k++) tpts.push([40, 462 - k * 13, -Math.PI / 2]);
      dyn.push({ k: 'trucks', pts: tpts });
      const am = metric('Vessels', nAnch, i, '', 0);
      segs.push({ id: 'anchorage', cls: 'maritime', label: 'ANCHORAGE · ' + n + ' VESSELS', hud: true, conf: jitterConf(0.91, meta.id, 'anch', i), geom: nPoly(rectPts(anch.x, anch.y, anch.w, anch.h)),
        area_m2: anch.w * anch.h * 2.25, metric: am, rule: 'Count of hulls at anchor inside the anchorage polygon. Threshold alert at 28 vessels.' });
      segs.push({ id: 'yard', cls: 'logistics', label: 'CONTAINER YARD · ' + util[i + 1] + '%', hud: true, conf: jitterConf(0.89, meta.id, 'yard', i), geom: nPoly(rectPts(80, 60, 760, 885)),
        area_m2: 760 * 885 * 2.25, metric: metric('Utilization', util, i, '%', 0, 'pp'), rule: 'Share of container slots occupied, from stack segmentation across yards A to D.' });
      zones.forEach((z) => segs.push({ id: z.id, cls: 'logistics', label: z.label, hud: false, conf: jitterConf(0.86, meta.id, z.id, i), geom: nPoly(rectPts(z.x, z.y, z.w, z.h)),
        area_m2: z.w * z.h * 2.25, metric: metric('Utilization', util, i, '%', 0, 'pp'), rule: 'Stack segmentation inside the yard block polygon.' }));
      segs.push({ id: 'gate', cls: 'logistics', label: 'GATE QUEUE · ' + g, hud: true, conf: jitterConf(0.88, meta.id, 'gate', i), geom: nPoly(rectPts(26, Math.max(20, 462 - g * 13 - 10), 28, g * 13 + 24)),
        area_m2: 28 * (g * 13 + 24) * 2.25, metric: metric('Trucks', gate, i, '', 0), rule: 'Trucks queued on the gate approach road.' });
      for (let k = 0; k < 8; k++) segs.push({ id: 'crane-' + (k + 1), cls: 'industrial', label: 'STS CRANE ' + (k + 1), hud: false, conf: jitterConf(0.93, meta.id, 'cr' + k, i), geom: nPoly(rectPts(820, 70 + k * 118 - 7, 150, 14)),
        area_m2: 150 * 14 * 2.25, metric: { name: 'Boom', value: 'Down', unit: '', prior: 'Down', delta: null }, rule: 'Ship-to-shore crane footprint.' });
      return { items: dyn, segments: segs };
    }
    return { static: st, pass: pass, key: 'anchorage', history: { anchorage: nAnch.slice(1), util: util.slice(1), gate: gate.slice(1) } };
  }

  /* ======================= Cushing ======================= */
  function cushing(meta) {
    const rnd = TT.rng(TT.hash(meta.id));
    const st = [{ k: 'ground', color: '#6d7356', alt: '#7a7a5c', seed: 37 }];
    for (let j = 0; j < 9; j++) st.push({ k: 'poly', pts: rectPts(R(rnd, -60, 1500), R(rnd, -60, 900), R(rnd, 160, 420), R(rnd, 120, 300)), fill: ['#76805a', '#6a7250', '#857c5c', '#7d8a60'][j % 4], alpha: 0.55 });
    st.push({ k: 'poly', pts: rectPts(60, 100, 720, 800), fill: '#7f7a68' }, { k: 'poly', pts: rectPts(820, 100, 720, 800), fill: '#7f7a68' });
    st.push({ k: 'berm', x: 60, y: 100, w: 720, h: 800 }, { k: 'berm', x: 820, y: 100, w: 720, h: 800 });
    st.push({ k: 'road', pts: [[0, 50], [1600, 50]], w: 18 }, { k: 'road', pts: [[800, 0], [800, 1000]], w: 16 }, { k: 'road', pts: [[0, 950], [1600, 950]], w: 14 });
    st.push({ k: 'pipes', x: 60, y: 488, w: 1480, n: 3, gap: 8 });
    st.push({ k: 'bldg', x: 760, y: 470, w: 80, h: 60, tone: '#a29d92', ht: 8 });
    const tanks = [];
    const grid = (g, ox) => { let n = 1; for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) { const t = { id: 'tk-' + g + n, label: 'TK-' + g.toUpperCase() + n, g: g, x: ox + 190 + c * 340, y: 240 + r * 260, r: R(rnd, 98, 112), conf: TT.round(R(rnd, 0.8, 0.97), 2) }; tanks.push(t); n++; } };
    grid('w', 60); grid('e', 820);
    tanks.forEach((t) => st.push({ k: 'tankpad', x: t.x, y: t.y, r: t.r }));
    const avg = { e: [42.6, 44.0, 45.6, 47.1, 48.9, 50.6, 53.4], w: [52.1, 52.0, 52.2, 51.9, 52.3, 52.1, 52.2] };
    const offs = {};
    ['e', 'w'].forEach((g) => { const list = tanks.filter((t) => t.g === g); const o = list.map(() => R(rnd, -7, 7)); const m = o.reduce((s, v) => s + v, 0) / o.length; list.forEach((t, k) => { offs[t.id] = o[k] - m; }); });
    const fillSeries = tanks.map((t) => groupSeries(rnd, avg[t.g], PASSES + 1, offs[t.id]));
    function pass(i) {
      const dyn = tankItems(tanks, fillSeries.map((s) => s[i + 1] / 100));
      const segs = tankSegs(meta, tanks, fillSeries, i, 'tank');
      [['e', 'CUSHING EAST', 820], ['w', 'CUSHING WEST', 60]].forEach(([g, label, x]) => {
        const m = metric('Fill', avg[g], i, '%', 1, 'pp');
        const tag = m.delta >= 2 ? ' · BUILD' : m.delta <= -5 ? ' · DRAWDOWN' : '';
        segs.push({ id: 'grp-' + g, cls: 'energy', label: label + tag, hud: true, conf: jitterConf(g === 'e' ? 0.9 : 0.92, meta.id, 'g' + g, i), geom: nPoly(rectPts(x, 100, 720, 800)),
          area_m2: 720 * 800 * 0.36, metric: m, rule: 'Mean of member tank fills. Build flag when the single-pass change is 2 pp or more.', members: tanks.filter((t) => t.g === g).map((t) => t.id) });
      });
      segs.push({ id: 'manifold', cls: 'industrial', label: 'MANIFOLD', hud: false, conf: jitterConf(0.83, meta.id, 'mf', i), geom: nPoly(rectPts(760, 470, 80, 60)), area_m2: 80 * 60 * 0.36,
        metric: { name: 'Status', value: 'Operating', unit: '', prior: 'Operating', delta: null }, rule: 'Pump station footprint.' });
      return { items: dyn, segments: segs };
    }
    return { static: st, pass: pass, key: 'grp-e', history: { east: avg.e.slice(1) } };
  }

  /* ======================= Barstow rail yard ======================= */
  function barstow(meta) {
    const rnd = TT.rng(TT.hash(meta.id));
    const st = [{ k: 'ground', color: '#8f816a', alt: '#9a8b72', seed: 41 }];
    st.push({ k: 'poly', pts: [[100, 210], [1500, 210], [1500, 780], [100, 780]], fill: '#7c7062' });
    const tracks = [];
    for (let j = 0; j < 14; j++) { const y = 260 + j * 36; tracks.push({ id: 'trk-' + String(j + 1).padStart(2, '0'), y: y, x1: 300, x2: 1300 }); }
    tracks.forEach((t) => { st.push({ k: 'track', pts: [[t.x1, t.y], [t.x2, t.y]] }, { k: 'track', pts: [[t.x1, t.y], [140, 494]] }, { k: 'track', pts: [[t.x2, t.y], [1460, 494]] }); });
    st.push({ k: 'track', pts: [[0, 494], [140, 494]] }, { k: 'track', pts: [[1460, 494], [1600, 494]] });
    st.push({ k: 'track', pts: [[0, 150], [1600, 150]] }, { k: 'track', pts: [[0, 166], [1600, 166]] }, { k: 'track', pts: [[0, 850], [1600, 850]] }, { k: 'track', pts: [[0, 866], [1600, 866]] });
    st.push({ k: 'road', pts: [[0, 950], [1600, 950]], w: 18 }, { k: 'road', pts: [[1200, 950], [1200, 870]], w: 10 });
    st.push({ k: 'bldg', x: 1150, y: 40, w: 300, h: 76, tone: '#a8a197', ht: 12, detail: 'ridges' }, { k: 'bldg', x: 160, y: 900, w: 120, h: 40, tone: '#b5aea2', ht: 6 });
    const totals = [389, 402, 418, 431, 455, 471, 486];
    const share = tracks.map(() => R(rnd, 0.7, 1.3));
    const sum = share.reduce((s, v) => s + v, 0);
    const per = (i) => { const tot = totals[i]; const arr = share.map((s) => Math.min(35, Math.round((s / sum) * tot))); let diff = tot - arr.reduce((s, v) => s + v, 0); let k = 0; while (diff !== 0 && k < 200) { const j = k % arr.length; if (diff > 0 && arr[j] < 35) { arr[j]++; diff--; } else if (diff < 0 && arr[j] > 0) { arr[j]--; diff++; } k++; } return arr; };
    const perPass = totals.map((_, i) => per(i));
    function pass(i) {
      const counts = perPass[i + 1], prior = perPass[i];
      const dyn = [];
      const segs = [];
      tracks.forEach((t, j) => {
        const n = counts[j];
        const startX = t.x1 + 20 + ((TT.hash(t.id + i) % 5) * 6);
        dyn.push({ k: 'railcars', x: startX, y: t.y, n: n, len: 25, gap: 3, seed: TT.hash(t.id) });
        if (n > 0) segs.push({ id: t.id, cls: 'logistics', label: t.id.toUpperCase(), hud: false, conf: jitterConf(0.88, meta.id, t.id, i), geom: nPoly(rectPts(startX - 4, t.y - 8, n * 28 + 5, 16)),
          area_m2: n * 28 * 12 * 0.36, metric: { name: 'Railcars', value: n, unit: '', prior: prior[j], delta: n - prior[j], digits: 0 }, rule: 'Railcar instances on the track centerline.' });
      });
      dyn.push({ k: 'railcars', x: 200 + (i * 37) % 300, y: 150, n: 3, len: 34, gap: 2, seed: 7, loco: true });
      dyn.push({ k: 'railcars', x: 900 - (i * 53) % 400, y: 866, n: 2, len: 34, gap: 2, seed: 9, loco: true });
      segs.push({ id: 'class-yard', cls: 'logistics', label: 'CLASS YARD · ' + totals[i + 1] + ' CARS', hud: true, conf: jitterConf(0.9, meta.id, 'cy', i), geom: nPoly(rectPts(290, 240, 1020, 506)),
        area_m2: 1020 * 506 * 0.36, metric: metric('Railcars', totals, i, '', 0), rule: 'Sum of railcar instances across 14 classification tracks.' });
      segs.push({ id: 'shed', cls: 'industrial', label: 'SERVICE SHED', hud: true, conf: jitterConf(0.86, meta.id, 'sh', i), geom: nPoly(rectPts(1150, 40, 300, 76)), area_m2: 300 * 76 * 0.36,
        metric: { name: 'Status', value: 'Active', unit: '', prior: 'Active', delta: null }, rule: 'Building footprint.' });
      segs.push({ id: 'mainline', cls: 'logistics', label: 'MAIN LINE', hud: false, conf: jitterConf(0.84, meta.id, 'ml', i), geom: nPoly(rectPts(0, 140, 1600, 36)), area_m2: 1600 * 36 * 0.36,
        metric: { name: 'Trains', value: 1, unit: '', prior: 1, delta: 0 }, rule: 'Locomotive consists on the main line.' });
      return { items: dyn, segments: segs };
    }
    return { static: st, pass: pass, key: 'class-yard', history: { railcars: totals.slice(1) } };
  }

  /* ======================= Ontario retail lot ======================= */
  function ontario(meta) {
    const rnd = TT.rng(TT.hash(meta.id));
    const st = [{ k: 'ground', color: '#7e776b', alt: '#857e70', seed: 53 }];
    const lots = [{ id: 'lot-n', label: 'LOT WEST', x: 80, y: 80, w: 720, h: 840 }, { id: 'lot-s', label: 'LOT SOUTH', x: 860, y: 610, w: 600, h: 310 }];
    lots.forEach((l) => st.push({ k: 'poly', pts: rectPts(l.x, l.y, l.w, l.h), fill: '#3d3d40' }));
    st.push({ k: 'road', pts: [[0, 960], [1600, 960]], w: 26 }, { k: 'road', pts: [[830, 960], [830, 0]], w: 20 });
    st.push({ k: 'bldg', x: 860, y: 80, w: 600, h: 500, tone: '#cbc8bf', ht: 16, detail: 'hvac' });
    st.push({ k: 'poly', pts: rectPts(1470, 110, 100, 440), fill: '#4a4a4d' });
    const stalls = [];
    lots.forEach((l) => {
      const sw = 9, sh = 18, aisle = 22;
      for (let y = l.y + 10; y + sh * 2 <= l.y + l.h - 6; y += sh * 2 + aisle) {
        st.push({ k: 'stalls', x: l.x + 10, y: y, cols: Math.floor((l.w - 20) / sw), sw: sw, sh: sh });
        for (let c = 0; c < Math.floor((l.w - 20) / sw); c++) for (let r = 0; r < 2; r++) stalls.push({ lot: l.id, x: l.x + 10 + c * sw + sw / 2, y: y + r * sh + sh / 2 });
      }
    });
    const entrance = [1160, 600];
    stalls.forEach((s) => { const d = Math.hypot(s.x - entrance[0], s.y - entrance[1]); s.rank = d + (TT.hash(s.x + ':' + s.y) % 1000) * 0.35; s.color = TT.hash('c' + s.x + s.y) % 9; });
    const order = stalls.slice().sort((a, b) => a.rank - b.rank);
    order.forEach((s, k) => { s.order = k; });
    const occ = [52, 41, 58, 63, 47, 72, 66];
    const docks = [3, 2, 4, 3, 5, 4, 4];
    function pass(i) {
      const dyn = [];
      const o = occ[i + 1] / 100, n = Math.round(stalls.length * o);
      dyn.push({ k: 'cars', stalls: stalls, n: n });
      const tp = [];
      for (let k = 0; k < docks[i + 1]; k++) tp.push([1520, 150 + k * 80, 0]);
      dyn.push({ k: 'trucks', pts: tp, big: true });
      const segs = [];
      segs.push({ id: 'parking', cls: 'logistics', label: 'PARKING · ' + occ[i + 1] + '%', hud: true, conf: jitterConf(0.92, meta.id, 'pk', i), geom: nPoly([[80, 80], [800, 80], [800, 610], [1460, 610], [1460, 920], [80, 920]]),
        area_m2: (720 * 840 + 600 * 310) * 0.09, metric: metric('Occupancy', occ, i, '%', 0, 'pp'), rule: 'Vehicle instances over striped stall count across both lots.' });
      lots.forEach((l) => { const inLot = stalls.filter((s) => s.lot === l.id); const cnt = inLot.filter((s) => s.order < n).length; const pn = Math.round(stalls.length * occ[i] / 100); const pc = inLot.filter((s) => s.order < pn).length;
        segs.push({ id: l.id, cls: 'logistics', label: l.label, hud: false, conf: jitterConf(0.9, meta.id, l.id, i), geom: nPoly(rectPts(l.x, l.y, l.w, l.h)), area_m2: l.w * l.h * 0.09,
          metric: { name: 'Vehicles', value: cnt, unit: '', prior: pc, delta: cnt - pc, digits: 0 }, rule: 'Vehicle instances inside the lot polygon.' }); });
      segs.push({ id: 'docks', cls: 'logistics', label: 'DOCKS', hud: true, conf: jitterConf(0.87, meta.id, 'dk', i), geom: nPoly(rectPts(1470, 110, 100, 440)), area_m2: 100 * 440 * 0.09,
        metric: metric('Trucks', docks, i, '', 0), rule: 'Trailers at loading doors.' });
      segs.push({ id: 'store', cls: 'industrial', label: 'STORE ROOF', hud: false, conf: jitterConf(0.95, meta.id, 'st', i), geom: nPoly(rectPts(860, 80, 600, 500)), area_m2: 600 * 500 * 0.09,
        metric: { name: 'Status', value: 'Open', unit: '', prior: 'Open', delta: null }, rule: 'Building footprint.' });
      return { items: dyn, segments: segs };
    }
    return { static: st, pass: pass, key: 'parking', history: { occupancy: occ.slice(1) } };
  }

  /* ======================= Gary industrial complex ======================= */
  function gary(meta) {
    const rnd = TT.rng(TT.hash(meta.id));
    const st = [{ k: 'ground', color: '#5f5d58', alt: '#67645e', seed: 61 }];
    st.push({ k: 'water', pts: [[0, 0], [1600, 0], [1600, 150], [1200, 166], [800, 158], [420, 172], [420, 420], [260, 420], [260, 175], [0, 162]] });
    st.push({ k: 'quay', x: 420, y: 172, w: 14, h: 250 }, { k: 'quay', x: 246, y: 172, w: 14, h: 250 });
    st.push({ k: 'road', pts: [[0, 960], [1600, 960]], w: 22 }, { k: 'road', pts: [[1120, 960], [1120, 200]], w: 16 });
    st.push({ k: 'track', pts: [[450, 500], [1100, 500]] }, { k: 'track', pts: [[450, 516], [1100, 516]] });
    st.push({ k: 'bldg', x: 1160, y: 540, w: 400, h: 120, tone: '#7b4f3a', ht: 18, detail: 'ridges' }, { k: 'bldg', x: 1160, y: 690, w: 400, h: 110, tone: '#6f6f6c', ht: 16, detail: 'ridges' },
      { k: 'bldg', x: 1160, y: 820, w: 260, h: 110, tone: '#84593f', ht: 14, detail: 'ridges' }, { k: 'bldg', x: 470, y: 820, w: 300, h: 100, tone: '#77746f', ht: 12 });
    [[1250, 330, 46], [1340, 300, 28], [1340, 370, 28], [1410, 300, 28], [1410, 370, 28]].forEach(([x, y, r]) => st.push({ k: 'column', x: x, y: y, r: r }));
    st.push({ k: 'pad', x: 520, y: 220, w: 600, h: 260 }, { k: 'pad', x: 520, y: 560, w: 600, h: 240 });
    const ore = [2.0, 1.92, 1.88, 1.81, 1.76, 1.7, 1.63];
    const coal = [0.85, 0.84, 0.86, 0.83, 0.85, 0.88, 0.86];
    const hoppers = [12, 14, 9, 16, 11, 18, 15];
    const piles = [
      { id: 'ore', label: 'ORE STOCKPILE', x: 700, y: 345, r: 150, color: '#8a4b33', series: ore, base: 2.0, unit: 'Mt' },
      { id: 'ore-2', label: 'ORE PILE 2', x: 990, y: 330, r: 82, color: '#7f4630', series: ore.map((v) => TT.round(v * 0.4, 2)), base: 0.8, unit: 'Mt' },
      { id: 'coal', label: 'COAL PILE', x: 760, y: 680, r: 120, color: '#2b2a28', series: coal, base: 0.85, unit: 'Mt' },
      { id: 'lime', label: 'LIMESTONE', x: 1030, y: 690, r: 70, color: '#b9b3a6', series: [0.3, 0.3, 0.31, 0.29, 0.3, 0.31, 0.3], base: 0.3, unit: 'Mt' },
    ];
    piles.forEach((p) => { p.shape = Array.from({ length: 22 }, (_, k) => 0.82 + rnd() * 0.3); });
    function pilePts(p, scale) { return p.shape.map((m, k) => { const a = (k / p.shape.length) * Math.PI * 2; const rr = p.r * scale * m; return [p.x + Math.cos(a) * rr * 1.25, p.y + Math.sin(a) * rr * 0.85]; }); }
    function pass(i) {
      const dyn = [];
      const segs = [];
      piles.forEach((p) => {
        const v = p.series[i + 1];
        const scale = Math.sqrt(v / p.base);
        const pts = pilePts(p, scale);
        dyn.push({ k: 'pile', pts: pts, x: p.x, y: p.y, color: p.color });
        const hud = p.id === 'ore' || p.id === 'coal';
        segs.push({ id: p.id, cls: 'industrial', label: p.label + (hud ? ' · ' + v.toFixed(2) + ' ' + p.unit : ''), hud: hud, conf: jitterConf(p.id === 'lime' ? 0.79 : 0.88, meta.id, p.id, i), geom: nPoly(pts),
          area_m2: polyArea(pts) * meta.gsd * meta.gsd, metric: metric('Volume', p.series, i, ' ' + p.unit, 2), rule: 'Pile footprint and shadow length converted to volume with a 38 degree angle of repose.' });
      });
      const draft = [0.62, 0.55, 0.7, 0.48, 0.66, 0.58, 0.51][i + 1];
      dyn.push({ k: 'ship', x: 340, y: 300, len: 170, beam: 34, rot: Math.PI / 2, tone: 4, moored: true, load: draft });
      segs.push({ id: 'carrier', cls: 'maritime', label: 'ORE CARRIER', hud: true, conf: jitterConf(0.93, meta.id, 'cv', i), geom: nPoly(rotRect(340, 300, 176, 40, Math.PI / 2)),
        area_m2: 170 * 34 * 0.36, metric: { name: 'Hold load', value: Math.round(draft * 100), unit: '%', prior: Math.round([0.62, 0.55, 0.7, 0.48, 0.66, 0.58, 0.51][i] * 100), delta: Math.round((draft - [0.62, 0.55, 0.7, 0.48, 0.66, 0.58, 0.51][i]) * 100), deltaUnit: 'pp', digits: 0 },
        rule: 'Freeboard ratio from hull shadow, converted to hold load.' });
      dyn.push({ k: 'railcars', x: 470, y: 508, n: hoppers[i + 1], len: 26, gap: 4, seed: 3, hopper: true });
      segs.push({ id: 'hoppers', cls: 'logistics', label: 'HOPPER CARS', hud: false, conf: jitterConf(0.87, meta.id, 'hp', i), geom: nPoly(rectPts(466, 498, hoppers[i + 1] * 30 + 6, 20)), area_m2: hoppers[i + 1] * 30 * 20 * 0.36,
        metric: metric('Railcars', hoppers, i, '', 0), rule: 'Railcar instances on the unloading spur.' });
      segs.push({ id: 'furnace', cls: 'industrial', label: 'BLAST FURNACE', hud: false, conf: jitterConf(0.9, meta.id, 'bf', i), geom: nCircle(1330, 335, 120), area_m2: Math.PI * Math.pow(120 * 0.6, 2),
        metric: { name: 'Status', value: 'Operating', unit: '', prior: 'Operating', delta: null }, rule: 'Stove cluster footprint with thermal plume cue.' });
      segs.push({ id: 'mill', cls: 'industrial', label: 'ROLLING MILL', hud: false, conf: jitterConf(0.91, meta.id, 'ml', i), geom: nPoly(rectPts(1160, 540, 400, 390)), area_m2: 400 * 390 * 0.36,
        metric: { name: 'Status', value: 'Operating', unit: '', prior: 'Operating', delta: null }, rule: 'Building footprint.' });
      return { items: dyn, segments: segs };
    }
    return { static: st, pass: pass, key: 'ore', history: { ore: ore.slice(1) } };
  }

  const builders = { 'ela-segundo-tanks': elSegundo, 'san-pedro-port': sanPedro, 'cushing-hub': cushing, 'barstow-rail': barstow, 'ontario-retail': ontario, 'gary-works': gary };
  const cache = new Map();

  TT.mock.scenes = {
    W: W, H: H, PASSES: PASSES, MODEL: MODEL,
    get(siteId, bootTs) {
      const key = siteId + '@' + bootTs;
      if (cache.has(key)) return cache.get(key);
      const meta = TT.mock.data.sites.find((s) => s.id === siteId);
      if (!meta) return null;
      const model = builders[siteId](meta);
      const latest = bootTs - meta.latestAgoMin * 60000;
      const passes = Array.from({ length: PASSES }, (_, i) => ({ id: siteId + '-p' + i, i: i, ts: latest - (PASSES - 1 - i) * meta.cadenceH * 3600000 }));
      const passCache = new Map();
      const out = {
        meta: meta, passes: passes, key: model.key, history: model.history, static: model.static,
        pass(i) {
          if (!passCache.has(i)) passCache.set(i, model.pass(i));
          return passCache.get(i);
        },
      };
      cache.set(key, out);
      return out;
    },
  };
})();
