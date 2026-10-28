#!/usr/bin/env node
// TERRATERM regression probes. Offline checks for previously fixed defects.
// Each probe injects a backend (or uses the scaffold) and reports { bug: true|false }. Exit code 1 if any bug is present.
//   node test/regression.mjs                 (from the project root, after npm install)
//   node test/regression.mjs path/to/terraterm.html A_passIdCollision   (one probe)
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtempSync, cpSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import http from 'node:http';
let chromium;
try { ({ chromium } = createRequire(resolve('package.json'))('playwright')); }
catch (e) { ({ chromium } = createRequire(import.meta.url)('playwright')); }
const DIST = resolve(process.argv[2] || 'dist/terraterm.html');
const URL0 = pathToFileURL(DIST).href;
const only = process.argv[3];
const out = {};
const browser = await chromium.launch();

async function page(init, hash = '', vp = { width: 1440, height: 900 }, waitUntil = 'load') {
  const ctx = await browser.newContext({ viewport: vp });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  if (init) await p.addInitScript(init);
  await p.goto(URL0 + hash, { waitUntil });
  await p.waitForFunction(() => window.TT && TT.app && TT.app.api, null, { timeout: 10000 });
  return { ctx, p, errs };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Shared live backend factory, serialized into the page.
const liveBase = `
  window.__mkImg = (color) => { const c = document.createElement('canvas'); c.width = 320; c.height = 200; const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, 320, 200); return c.toDataURL(); };
  window.__q = (sym) => ({ sym, name: sym, kind: 'index', px: 100, prev: 99, chg: 1, chgPct: 0.0101, ts: Date.now() });
  window.__kpis = ['SPX','CL1','HG1','US10Y','DXY','VIX'];
`;

async function run(name, fn) {
  if (only && name !== only) return;
  try { out[name] = await fn(); } catch (e) { out[name] = { error: e.message.split('\n')[0] }; }
  console.log(name, JSON.stringify(out[name]));
}

// A: pass-id collision across sites in the imagery LRU
await run('A_passIdCollision', async () => {
  const init = liveBase + `
    window.__calls = [];
    window.TERRATERM = { mode: 'live', config: { defaultSite: 'a' }, api: {
      watchlist: async () => ({ asOf: Date.now(), source: 'live', quotes: __kpis.map(__q) }),
      macro: async ({ tf }) => ({ asOf: Date.now(), source: 'live', tf, kpis: [], series: [], signals: [] }),
      imagery: async ({ site }) => { const col = site === 'a' ? '#ff0000' : '#0000ff';
        const pass = { id: 'p0', i: 0, ts: Date.now() - 6e5, sensor: 'S', gsd: 0.5, model: 'M', imageUrl: __mkImg(col), segments: [] };
        return { asOf: Date.now(), site: { id: site, name: 'Site ' + site, short: site, type: 'Port', region: 'X', cls: 'maritime' }, passes: [{ id: 'p0', i: 0, ts: pass.ts }], pass, prior: null }; },
      ask: async () => ({ text: 'x', sources: [], confidence: 0.5 }),
      sites: async () => ({ asOf: Date.now(), sites: ['a','b'].map((id) => ({ id, name: 'Site ' + id, short: id, type: 'Port', region: 'X', cls: 'maritime', latestPass: Date.now() - 6e5, segments: 0, keyLabel: 'K', keyMetric: { name: 'm', value: 1 }, keyConf: 0.9 })) }),
    } };`;
  const { ctx, p } = await page(init, '#/orbital/a');
  await p.waitForFunction(() => TT.views.orbital.viewer && TT.views.orbital.viewer.res && TT.views.orbital.viewer.site === 'a');
  await wait(300);
  const px = () => p.evaluate(() => { const v = TT.views.orbital.viewer; const c = v.canvas; const d = c.getContext('2d').getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data; return [d[0], d[1], d[2]]; });
  const a = await px();
  await p.evaluate(() => TT.router.go('orbital/b'));
  await p.waitForFunction(() => TT.views.orbital.viewer.site === 'b' && TT.views.orbital.viewer.res && TT.views.orbital.viewer.res.site.id === 'b');
  await wait(300);
  const b = await px();
  await ctx.close();
  return { siteA_center_rgb: a, siteB_center_rgb: b, siteB_expected: 'blue', bug: b[0] > 200 && b[2] < 50 };
});

// B: cadence column in F7 is fabricated when sites() has no cadenceH
await run('B_cadenceFabricated', async () => {
  const init = liveBase + `
    window.TERRATERM = { mode: 'live', config: { defaultSite: 'a' }, api: {
      watchlist: async () => ({ asOf: Date.now(), source: 'live', quotes: __kpis.map(__q) }),
      macro: async ({ tf }) => ({ asOf: Date.now(), source: 'live', tf, kpis: [], series: [], signals: [] }),
      imagery: async ({ site }) => ({ asOf: Date.now(), site: { id: site, name: 'S', short: 'S', type: 'Port', region: 'X', cls: 'maritime' }, passes: [{ id: site + 'p0', i: 0, ts: Date.now() }], pass: { id: site + 'p0', i: 0, ts: Date.now(), sensor: 'S', gsd: 1, model: 'M', imageUrl: __mkImg('#333'), segments: [] }, prior: null }),
      ask: async () => ({ text: 'x', sources: [], confidence: 0.5 }),
      sites: async () => ({ asOf: Date.now(), sites: [{ id: 'a', name: 'Weekly Port', short: 'WP', type: 'Port', region: 'X', cls: 'maritime', latestPass: Date.now() - 6e5, segments: 3, keyLabel: 'K', keyMetric: { name: 'm', value: 1 }, keyConf: 0.9 }] }),
    } };`;
  const { ctx, p } = await page(init, '#/intel');
  await p.waitForFunction(() => document.querySelector('#view-intel tbody tr.row'));
  const cad = await p.evaluate(() => { const tr = document.querySelector('#view-intel tbody tr.row'); return tr.lastElementChild.textContent; });
  await ctx.close();
  return { cadenceShown: cad, backendSentCadence: false, bug: cad === 'daily' };
});

// C: macro() that does not echo tf causes a request storm and never renders
await run('C_macroTfStorm', async () => {
  const init = liveBase + `
    window.__macroCalls = 0;
    window.TERRATERM = { mode: 'live', config: { defaultSite: 'a' }, api: {
      watchlist: async () => ({ asOf: Date.now(), source: 'live', quotes: __kpis.map(__q) }),
      macro: async () => { __macroCalls++; return { asOf: Date.now(), source: 'live', kpis: __kpis.map((s) => ({ slot: 'x', sym: s, name: s, kind: 'index', value: 100, chg: 1, chgPct: 0.01 })), series: __kpis.map((s) => ({ id: s, name: s, kind: 'index', points: [[Date.now() - 864e5, 100], [Date.now(), 101]] })), signals: [] }; },
      imagery: async ({ site }) => ({ asOf: Date.now(), site: { id: site, name: 'S', short: 'S', type: 'Port', region: 'X', cls: 'maritime' }, passes: [{ id: 'p', i: 0, ts: Date.now() }], pass: { id: 'p', i: 0, ts: Date.now(), sensor: 'S', gsd: 1, model: 'M', imageUrl: __mkImg('#333'), segments: [] }, prior: null }),
      ask: async () => ({ text: 'x', sources: [], confidence: 0.5 }),
    } };`;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.addInitScript(init);
  await p.goto(URL0 + '#/macro', { waitUntil: 'commit' });
  await wait(2500);
  const r = await Promise.race([
    p.evaluate(() => ({ calls: __macroCalls, rendered: !!(TT.views.macro && TT.views.macro.res), kpi0: document.querySelector('#view-macro .kpi .k-v').textContent })),
    wait(5000).then(() => ({ frozen: true })),
  ]);
  await ctx.close().catch(() => null);
  return Object.assign(r, { expectedCallsIn2_5s: '1 or 2', bug: !!r.frozen || r.calls > 5 || !r.rendered });
});

// D: rolling pass window: cached index returns a stale pass after a new pass arrives
await run('D_rollingIndexCache', async () => {
  const init = liveBase + `
    window.__base = Date.now() - 10 * 864e5; window.__latest = 2;   // passes are the last 3 days: absolute days latest-2..latest
    const mk = (abs, i) => ({ id: 'd' + abs, i, ts: __base + abs * 864e5 });
    window.TERRATERM = { mode: 'live', config: { defaultSite: 'a' }, api: {
      watchlist: async () => ({ asOf: Date.now(), source: 'live', quotes: __kpis.map(__q) }),
      macro: async ({ tf }) => ({ asOf: Date.now(), source: 'live', tf, kpis: [], series: [], signals: [] }),
      imagery: async ({ site, pass }) => { const win = [0, 1, 2].map((k) => mk(__latest - 2 + k, k)); const idx = pass == null ? 2 : Number(pass); const pm = win[idx];
        return { asOf: Date.now(), site: { id: site, name: 'S', short: 'S', type: 'Port', region: 'X', cls: 'maritime' }, passes: win, pass: Object.assign({ sensor: 'S', gsd: 1, model: 'M', imageUrl: __mkImg('#333'), segments: [] }, pm), prior: null }; },
      ask: async () => ({ text: 'x', sources: [], confidence: 0.5 }),
    } };`;
  const { ctx, p } = await page(init, '#/desk');
  const r = await p.evaluate(async () => {
    const before = await TT.app.imagery('a', 1);
    window.__latest = 3; // a new pass lands; the window rolls by one
    TT.app.imgCache.delete('a:latest'); // what onSites() does when latestPass advances
    const latest = await TT.app.imagery('a');
    const after = await TT.app.imagery('a', 1);
    return { idx1_before: before.pass.id, idx1_after_cache: after.pass.id, idx1_backend_now: latest.passes[1].id };
  });
  await ctx.close();
  return Object.assign(r, { bug: r.idx1_after_cache !== r.idx1_backend_now });
});

// E: rule status label does not change to FIRED when a rule fires
await run('E_ruleStatusStale', async () => {
  const { ctx, p } = await page(null, '#/alerts');
  await p.waitForFunction(() => TT.app.quotesAsOf);
  await p.evaluate(() => TT.app.addRule({ sym: 'SPX', metric: 'px', op: '>', threshold: 0, channel: 'agent' }));
  await wait(2500);
  const r = await p.evaluate(() => { const rule = TT.app.rules.find((x) => x.sym === 'SPX'); const rows = Array.from(document.querySelectorAll('#view-alerts .sys-row')).map((x) => x.textContent); return { armedInState: rule.armed, uiRow: rows.find((t) => t.indexOf('SPX') >= 0) }; });
  await ctx.close();
  return Object.assign(r, { bug: r.armedInState === false && /ARMED/.test(r.uiRow) });
});

// F: context meter aria-valuemax is hardcoded
await run('F_meterValuemax', async () => {
  const init = liveBase + `
    window.TERRATERM = { mode: 'live', config: { defaultSite: 'a' }, api: {
      watchlist: async () => ({ asOf: Date.now(), source: 'live', quotes: __kpis.map(__q) }),
      macro: async ({ tf }) => ({ asOf: Date.now(), source: 'live', tf, kpis: [], series: [], signals: [] }),
      imagery: async ({ site }) => ({ asOf: Date.now(), site: { id: site, name: 'S', short: 'S', type: 'Port', region: 'X', cls: 'maritime' }, passes: [{ id: 'p', i: 0, ts: Date.now() }], pass: { id: 'p', i: 0, ts: Date.now(), sensor: 'S', gsd: 1, model: 'M', imageUrl: __mkImg('#333'), segments: [] }, prior: null }),
      ask: async () => ({ text: 'x', sources: [], confidence: 0.5 }),
      system: async () => ({ asOf: Date.now(), mode: 'live', models: [{ name: 'A', role: 'reasoning', where: 'cloud', status: 'ok', latencyMs: 100 }], context: { used: 150000, max: 200000 }, sourcesFused: 3 }),
    } };`;
  const { ctx, p } = await page(init, '#/desk');
  await p.waitForFunction(() => TT.app.system);
  await wait(200);
  const r = await p.evaluate(() => { const m = document.querySelector('.ctxbar-big'); return { valuenow: m.getAttribute('aria-valuenow'), valuemax: m.getAttribute('aria-valuemax'), valuetext: m.getAttribute('aria-valuetext'), visualWidth: m.firstChild.style.width }; });
  await ctx.close();
  return Object.assign(r, { bug: r.valuemax !== '200000' });
});

// G: scaffold agent claims vs the numbers it reads (non-demo scaffold)
await run('G_agentClaimsMatchData', async () => {
  const { ctx, p } = await page(null, '#/desk');
  await p.waitForFunction(() => TT.app.quotesAsOf);
  const r = await p.evaluate(async () => {
    const M = TT.app.api && window.TERRATERM.debug.world;
    const cl = M.market.quote('CL1'), co = M.market.quote('CO1'), spx = M.market.quote('SPX'), rty = M.market.quote('RTY');
    const rho = TT.pearson(M.market.fillDeltas, M.market.dailyReturns('CL1', M.market.fillDeltas.length));
    const sc = M.scene('ela-segundo-tanks'); const hist = sc.history.groupB; const deltas = hist.slice(1).map((v, k) => v - hist[k]);
    const last = Math.abs(deltas[deltas.length - 1]); const priorMax = Math.max.apply(null, deltas.slice(0, -1).map(Math.abs));
    const brief = TT.mock.agent(M, 'Brief me', {}).text;
    const tank = TT.mock.agent(M, 'tank drawdown', {}).text;
    return { wtiChgPct: cl.chgPct, brentChgPct: co.chgPct, rho, latestAbsDelta: last, priorMaxAbsDelta: priorMax, spx: spx.chgPct, rty: rty.chgPct,
      briefSaysWtiRally: /WTI rally/.test(brief), tankSaysPriceStrength: /coincide with price strength/.test(tank), tankSaysLargest: /That is the largest single-pass change/.test(tank), tankSaysBrentSmaller: /a smaller move/.test(tank) };
  });
  await ctx.close();
  const wrong = (r.tankSaysLargest && r.latestAbsDelta <= r.priorMaxAbsDelta) || (r.tankSaysPriceStrength && r.rho > -0.3) || (r.tankSaysBrentSmaller && Math.abs(r.brentChgPct) >= Math.abs(r.wtiChgPct)) || (r.briefSaysWtiRally && r.wtiChgPct <= 0);
  return Object.assign(r, { bug: wrong });
});

// H: back navigation applies the route twice (popstate + hashchange)
await run('H_doubleApply', async () => {
  const { ctx, p } = await page(null, '#/desk');
  await p.waitForFunction(() => TT.app.quotesAsOf);
  await p.evaluate(() => { TT.router.go('macro'); TT.router.go('alerts'); window.__applies = 0; TT.bus.on('route', () => window.__applies++); });
  await p.goBack();
  await wait(300);
  const n = await p.evaluate(() => ({ applies: window.__applies, view: TT.router.current.view }));
  await ctx.close();
  return Object.assign(n, { bug: n.applies > 1 });
});

// I: system() missing models/context crashes the renderers every poll
await run('I_systemShape', async () => {
  const init = liveBase + `
    window.TERRATERM = { mode: 'live', config: { defaultSite: 'a' }, api: {
      watchlist: async () => ({ asOf: Date.now(), source: 'live', quotes: __kpis.map(__q) }),
      macro: async ({ tf }) => ({ asOf: Date.now(), source: 'live', tf, kpis: [], series: [], signals: [] }),
      imagery: async ({ site }) => ({ asOf: Date.now(), site: { id: site, name: 'S', short: 'S', type: 'Port', region: 'X', cls: 'maritime' }, passes: [{ id: 'p', i: 0, ts: Date.now() }], pass: { id: 'p', i: 0, ts: Date.now(), sensor: 'S', gsd: 1, model: 'M', imageUrl: __mkImg('#333'), segments: [] }, prior: null }),
      ask: async () => ({ text: 'x', sources: [], confidence: 0.5 }),
      system: async () => ({ asOf: Date.now(), mode: 'live', models: [{ name: 'A', role: 'reasoning', where: 'cloud', status: 'ok', latencyMs: 100 }] }),
    } };`;
  const { ctx, p, errs } = await page(init, '#/desk');
  await wait(3500);
  await ctx.close();
  return { consoleErrorsIn3_5s: errs.length, sample: errs[0] && errs[0].split('\n')[0], bug: errs.length > 0 };
});

// J: demo mode writes the user's rules (armed state) to storage
await run('J_demoWritesRules', async () => {
  const { ctx, p } = await page(null, '#/desk');
  await p.waitForFunction(() => TT.app.quotesAsOf);
  const before = await p.evaluate(() => localStorage.getItem('terraterm.v1.rules'));
  await p.evaluate(() => TT.demo.start());
  await p.waitForFunction(() => TT.app.demo.on && TT.app.quotesAsOf);
  await p.evaluate(() => TT.app.addRule({ sym: 'SPX', metric: 'px', op: '>', threshold: 0, channel: 'agent' }));
  await wait(1500);
  const after = await p.evaluate(() => localStorage.getItem('terraterm.v1.rules'));
  await ctx.close();
  return { rulesChangedDuringDemo: before !== after, bug: before !== after };
});


// K: dev server must not serve a sibling folder whose name starts with "dist", and binds to localhost by default
await run('K_serverTraversal', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-srv-'));
  cpSync(resolve('scripts'), join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'dist')); writeFileSync(join(dir, 'dist', 'terraterm.html'), '<p>ok</p>');
  mkdirSync(join(dir, 'dist-private')); writeFileSync(join(dir, 'dist-private', 'keys.txt'), 'SECRET');
  const port = 5300 + Math.floor(Math.random() * 400);
  const srv = spawn(process.execPath, [join(dir, 'scripts', 'serve.mjs')], { env: Object.assign({}, process.env, { PORT: String(port) }), stdio: 'pipe' });
  const get = (path) => new Promise((res) => http.get({ host: '127.0.0.1', port, path }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res({ status: r.statusCode, body: b })); }).on('error', () => res({ status: 0, body: '' })));
  let index = { status: 0 };
  for (let k = 0; k < 30 && index.status !== 200; k++) { await wait(100); index = await get('/'); }
  const trav = await get('/..%2Fdist-private%2Fkeys.txt');
  srv.kill(); rmSync(dir, { recursive: true, force: true });
  return { index: index.status, traversal: trav.status, leaked: trav.body.indexOf('SECRET') >= 0, bug: index.status !== 200 || trav.body.indexOf('SECRET') >= 0 };
});

// L: macro subtitle counts only the signals drawn in the window
await run('L_signalCount', async () => {
  const { ctx, p } = await page(null, '#/macro');
  await p.waitForFunction(() => TT.views.macro && TT.views.macro.res && TT.views.macro.chart.markerPos);
  await wait(800);
  const r = await p.evaluate(() => { const sub = document.querySelector('#view-macro .fv-head .ps').textContent; const n = Number((/(\d+) physical signals/.exec(sub) || [])[1]); return { subtitleCount: n, drawn: TT.views.macro.chart.markerPos.length }; });
  await ctx.close();
  return Object.assign(r, { bug: r.subtitleCount !== r.drawn });
});

// M: market clock knows holidays after the published 2026-2028 table
await run('M_nyseBeyond2028', async () => {
  const { ctx, p } = await page(null, '#/desk');
  const r = await p.evaluate(() => ({
    july4_2029: TT.marketState(Date.parse('2029-07-04T15:00:00Z')).label,
    goodFriday2029: TT.marketState(Date.parse('2029-03-30T15:00:00Z')).label,
    xmasEve2029_1630Z: TT.marketState(Date.parse('2029-12-24T16:30:00Z')).label,
    ordinary2029: TT.marketState(Date.parse('2029-10-24T15:00:00Z')).label,
  }));
  await ctx.close();
  return Object.assign(r, { bug: r.july4_2029 !== 'HOLIDAY' || r.goodFriday2029 !== 'HOLIDAY' || !/EARLY/.test(r.xmasEve2029_1630Z) || r.ordinary2029 !== 'OPEN' });
});

// N: fmt.tokens must not round sub-1000 counts up to 1K 
await run('N_tokensBelow1000', async () => {
  const { ctx, p } = await page(null, '#/desk');
  const r = await p.evaluate(() => ({ t999: TT.fmt.tokens(999), t500: TT.fmt.tokens(500), t184200: TT.fmt.tokens(184200) }));
  await ctx.close();
  return Object.assign(r, { bug: r.t999 !== '999' || r.t500 !== '500' || r.t184200 !== '184K' });
});

// O: closing an F5 chart drawer disconnects its ResizeObserver 
await run('O_drawerChartDestroy', async () => {
  const { ctx, p } = await page(null, '#/commodities/CLZ6');
  await p.waitForFunction(() => TT.ui.drawer() && TT.ui.drawer().kind === 'symbol');
  await p.waitForFunction(() => !!TT.views.commodities._drawerChart, null, { timeout: 5000 });
  const before = await p.evaluate(() => { const v = TT.views.commodities; window.__chart = v._drawerChart || null; return { has: !!window.__chart, dead: !!(window.__chart && window.__chart.dead) }; });
  await p.evaluate(() => TT.ui.closeDrawer());
  await wait(150);
  const after = await p.evaluate(() => ({ has: !!window.__chart, dead: !!(window.__chart && window.__chart.dead), cleared: !TT.views.commodities._drawerChart }));
  await ctx.close();
  return Object.assign({ before, after }, { bug: !before.has || before.dead || !after.dead || !after.cleared });
});

// P: F1 macro chart exposes a text alternative with series values 
await run('P_macroTextAlt', async () => {
  const { ctx, p } = await page(null, '#/macro');
  await p.waitForFunction(() => TT.views.macro && TT.views.macro.res);
  await wait(600);
  const r = await p.evaluate(() => { const el = document.querySelector('#view-macro .chart-alt'); return { present: !!el, text: el ? el.textContent : '' }; });
  await ctx.close();
  return Object.assign(r, { bug: !r.present || !/SPX/.test(r.text) || !/CL1/.test(r.text) });
});

// Q: document carries a Content-Security-Policy 
await run('Q_cspPresent', async () => {
  const { ctx, p } = await page(null, '#/desk');
  const r = await p.evaluate(() => { const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]'); return { csp: m ? m.getAttribute('content') : '' }; });
  await ctx.close();
  return Object.assign(r, { bug: !/default-src/.test(r.csp) });
});

await browser.close();
const bugs = Object.entries(out).filter(([, v]) => v && (v.bug || v.error)).map(([k]) => k);
console.log('\n' + (bugs.length ? 'REGRESSIONS: ' + bugs.join(', ') : Object.keys(out).length + ' regression probes clean.'));
process.exit(bugs.length ? 1 : 0);
