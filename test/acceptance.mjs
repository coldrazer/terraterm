#!/usr/bin/env node
// TERRATERM acceptance suite. One check per blueprint acceptance line (§8), plus navigation (§7),
// states (§13), motion (§14), accessibility (§15), performance (§16), responsive (§4), demo (§18).
// Offline: runs against dist/terraterm.html with Playwright and axe-core.
//   node test/acceptance.mjs            headless
//   node test/acceptance.mjs --headed   watch it run
//   node test/acceptance.mjs --only 8.3 run checks whose id starts with 8.3
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(root, 'dist', 'terraterm.html');
const URL0 = pathToFileURL(DIST).href;
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const args = process.argv.slice(2);
const HEADED = args.includes('--headed');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

const results = [];
const consoleErrors = [];
let browser;

function assert(cond, msg) { if (!cond) throw new Error(msg); }
async function check(id, name, fn) {
  if (ONLY && !id.startsWith(ONLY)) return;
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ id, name, ok: true, detail: detail || '', ms: Date.now() - t0 });
    console.log(`PASS  ${id.padEnd(6)} ${name}${detail ? '  \u00b7 ' + detail : ''}`);
  } catch (e) {
    results.push({ id, name, ok: false, detail: e.message.split('\n')[0], ms: Date.now() - t0 });
    console.log(`FAIL  ${id.padEnd(6)} ${name}  \u00b7 ${e.message.split('\n')[0]}`);
  }
}
async function open(hash = '', opts = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1440, height: 900 } }, opts.context || {}));
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[${hash || 'desk'}] ${m.text()}`); });
  page.on('pageerror', (e) => consoleErrors.push(`[${hash || 'desk'}] pageerror ${e.message}`));
  await page.goto(URL0 + hash);
  if (opts.wait !== false) await ready(page);
  return { ctx, page };
}
async function ready(page) {
  await page.waitForFunction(() => window.TT && TT.app && TT.app.quotesAsOf && TT.app.system && TT.app.flow && TT.app.sites.length && (TT.router.current.view !== 'desk' || (TT.views.desk.viewer && TT.views.desk.viewer.res)), null, { timeout: 15000 });
}
const blur = (page) => page.evaluate(() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); });
const go = (page, route) => page.evaluate((r) => TT.router.go(r), route);
const view = (page) => page.evaluate(() => TT.router.current.view);
const askAndWait = async (page, text) => {
  await page.evaluate((t) => TT.app.ask(t), text);
  await page.waitForFunction(() => !TT.app.asking, null, { timeout: 20000 });
  return page.evaluate(() => { const m = TT.app.chat.filter((x) => x.role === 'agent').pop(); return m; });
};

(async () => {
  statSync(DIST);
  browser = await chromium.launch({ headless: !HEADED });
  const chromeVersion = browser.version();

  /* ===================== Contract: live backend ===================== */
  await check('0', 'Contract: a live backend with only the four required methods runs; missing methods are labeled', async () => {
    const live = () => {
      const now = () => Date.now();
      const q = (sym, px, prev, kind) => ({ sym: sym, name: sym + ' (live)', kind: kind, px: px, prev: prev, chg: px - prev, chgPct: px / prev - 1, hi: px * 1.01, lo: px * 0.99, ts: now() });
      const img = (() => { const c = document.createElement('canvas'); c.width = 320; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#556'; x.fillRect(0, 0, 320, 200); x.fillStyle = '#ddd'; x.beginPath(); x.arc(160, 100, 40, 0, 7); x.fill(); return c.toDataURL(); });
      window.TERRATERM = { mode: 'live', config: { org: 'LIVE TEST', sensorLabel: 'TEST-SAT', defaultSite: 'live-site' }, api: {
        watchlist: async () => ({ asOf: now(), source: 'live feed', quotes: [q('SPX', 6700, 6650, 'index'), q('CL1', 80, 78, 'commodity'), q('HG1', 4.9, 4.8, 'metal'), q('US10Y', 4.2, 4.1, 'yield'), q('DXY', 101, 100, 'index'), q('VIX', 15, 16, 'vol')] }),
        macro: async ({ tf }) => ({ asOf: now(), source: 'live feed', tf: tf, kpis: ['SPX', 'CL1', 'HG1', 'US10Y', 'DXY', 'VIX'].map((s, k) => ({ slot: ['Index', 'Commodity', 'Metal', 'Yield', 'Dollar', 'Vol'][k], sym: s, name: s, kind: k === 3 ? 'yield' : 'index', value: 100, chg: 1, chgPct: 0.01 })), series: ['SPX', 'CL1', 'HG1', 'US10Y', 'DXY', 'VIX'].map((s) => ({ id: s, name: s, kind: 'index', points: [[now() - 864e5, 100], [now(), 101]] })), signals: [] }),
        imagery: async ({ site }) => { const pass = { id: (site || 'live-site') + '-p0', i: 0, ts: now() - 6e5, sensor: 'TEST-SAT', gsd: 0.5, model: 'SAM 3.1', imageUrl: img(), segments: [{ id: 'tank', cls: 'energy', label: 'LIVE TANK', hud: true, conf: 0.91, geom: { t: 'circle', cx: 0.5, cy: 0.5, r: 0.1 }, area_m2: 1000, metric: { name: 'Fill', value: 50, unit: '%', prior: 55, delta: -5, deltaUnit: 'pp' }, rule: 'test' }] };
          return { asOf: now(), site: { id: site || 'live-site', name: 'Live Site', short: 'LIVE', type: 'Tank farm', region: 'Test', cls: 'energy', key: 'tank' }, passes: [{ id: pass.id, i: 0, ts: pass.ts }], pass: pass, prior: null }; },
        ask: async ({ prompt, onToken }) => { const text = 'Live answer to: ' + prompt; onToken && onToken(text, text); return { text: text, sources: [{ label: 'Live source', route: 'desk' }], confidence: 0.66 }; },
      } };
    };
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(live);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => consoleErrors.push('[live] pageerror ' + e.message));
    await page.goto(URL0);
    await page.waitForFunction(() => window.TT && TT.app.quotesAsOf && TT.views.desk.viewer && TT.views.desk.viewer.res, null, { timeout: 10000 });
    const r = await page.evaluate(async () => {
      await TT.app.ask('ping');
      return { mode: TT.app.mode, status: document.querySelector('.sb-mode').textContent, fb: TT.app.fallbacks.join(','), hint: document.querySelector('#panel-system .hint:not([hidden])') ? document.querySelector('#panel-system .hint:not([hidden])').textContent : '', hud: document.querySelector('#panel-macro .orb-hud').textContent, seg: TT.views.desk.viewer.segments.length, ans: TT.app.chat.filter((m) => m.role === 'agent').pop().text, org: document.querySelector('.org').textContent };
    });
    await ctx.close();
    assert(r.mode === 'live' && r.status === 'LIVE', 'mode ' + r.mode);
    assert(/sites/.test(r.fb) && /Not connected/.test(r.hint), 'missing-method labeling: ' + r.hint);
    assert(/TEST-SAT/.test(r.hud) && r.seg === 1, 'imageUrl pass not rendered');
    assert(/Live answer to: ping/.test(r.ans) && r.org === 'LIVE TEST', 'ask/config');
    return 'LIVE mode \u00b7 imageUrl imagery \u00b7 not connected: ' + r.fb;
  });

  /* ===================== §8.1 Desk ===================== */
  await check('8.1a', 'Desk: all six panels render from the API contract', async () => {
    const { ctx, page } = await open();
    const r = await page.evaluate(() => ({
      api: ['watchlist', 'macro', 'imagery', 'ask'].every((k) => typeof window.TERRATERM.api[k] === 'function'),
      panels: TT.$$('.desk > .panel').filter((p) => p.offsetParent !== null).map((p) => p.dataset.panel),
      wl: TT.$$('#panel-watch tr.row').length,
      kpi: TT.$$('#panel-macro .kpi .k-v').map((e) => e.textContent),
      orb: TT.views.desk.viewer.segments.length,
      agent: !!document.querySelector('#panel-agent .composer input'),
      flow: !!TT.views.desk.parts.flow.chart.data,
      tl: TT.$$('#panel-timeline .tl-item').length,
      sys: TT.$$('#panel-system .sys-model').length,
      subs: TT.$$('.desk > .panel .ph .ps').map((e) => e.textContent),
    }));
    assert(r.api, 'contract methods missing');
    assert(r.panels.length === 6, 'visible panels: ' + r.panels.join(','));
    assert(r.wl >= 10, 'watchlist rows ' + r.wl);
    assert(r.kpi.length === 6 && r.kpi.every((t) => t !== '\u2014'), 'KPI values ' + r.kpi.join('|'));
    assert(r.orb > 0 && r.agent && r.flow && r.tl >= 5 && r.sys === 3, JSON.stringify(r));
    assert(r.subs.every((s) => s.length > 3), 'every panel has a source/freshness sub label');
    await ctx.close();
    return `${r.panels.length} panels \u00b7 ${r.wl} quotes \u00b7 ${r.orb} segments \u00b7 ${r.tl} events`;
  });

  await check('8.1b', 'Desk: UTC clock ticks', async () => {
    const { ctx, page } = await open();
    const a = await page.textContent('.clock span:last-child');
    await page.waitForTimeout(1300);
    const b = await page.textContent('.clock span:last-child');
    await ctx.close();
    assert(a !== b && /^\d\d:\d\d:\d\dZ$/.test(b), `${a} -> ${b}`);
    return `${a} \u2192 ${b}`;
  });

  await check('8.1c', 'Desk: watchlist rows flash on update (12% green/red, 400 ms)', async () => {
    const { ctx, page } = await open();
    // Read the colour in the same tick the class is seen; the flash only lasts 400 ms.
    const bg = await (await page.waitForFunction(() => { const e = document.querySelector('#panel-watch td.flash-up, #panel-watch td.flash-down'); return e ? getComputedStyle(e).backgroundColor : null; }, null, { timeout: 8000, polling: 'raf' })).jsonValue();
    await ctx.close();
    assert(/rgba\((0, 217, 126|255, 77, 94), 0\.12\)/.test(bg), 'flash color ' + bg);
    return bg;
  });

  await check('8.1d', 'Desk: nothing overflows at 1440 x 900', async () => {
    const { ctx, page } = await open();
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => {
      const se = document.scrollingElement;
      const bad = [];
      TT.$$('.desk > .panel, .desk .ph, .topbar, .status, .kpi .k-v, #panel-watch td.num').forEach((e) => { if (e.scrollWidth > e.clientWidth + 1) bad.push((e.id || e.className) + ' ' + e.scrollWidth + '>' + e.clientWidth); });
      const fbar = document.querySelector('.fbar');
      return { w: se.scrollWidth, h: se.scrollHeight, bad: bad, fbar: fbar.scrollWidth <= fbar.clientWidth + 1 };
    });
    await ctx.close();
    assert(r.w <= 1440 && r.h <= 900, `document ${r.w}x${r.h}`);
    assert(!r.bad.length, 'overflow: ' + r.bad.slice(0, 4).join('; '));
    assert(r.fbar, 'function bar overflows');
    return `document ${r.w}x${r.h}, no clipped panels, KPIs or prices`;
  });

  /* ===================== §8.2 Macro ===================== */
  await check('8.2a', 'Macro: timeframe switch updates chart and KPI deltas together', async () => {
    const { ctx, page } = await open('#/macro');
    await page.waitForFunction(() => TT.views.macro.res && TT.views.macro.chart.data);
    await page.click('.seg-ctl button[data-tf="1D"]');
    await page.waitForFunction(() => TT.views.macro.res.tf === '1D');
    const before = await page.evaluate(() => ({ k: TT.$$('#view-macro .kpi .k-c').map((e) => e.textContent), x: TT.views.macro.chart.data.xLabel, t0: TT.views.macro.chart.data.series[0].points[0][0] }));
    await page.click('.seg-ctl button[data-tf="1W"]');
    await page.waitForFunction(() => TT.views.macro.res.tf === '1W', null, { timeout: 5000 });
    const after = await page.evaluate(() => ({ k: TT.$$('#view-macro .kpi .k-c').map((e) => e.textContent), x: TT.views.macro.chart.data.xLabel, t0: TT.views.macro.chart.data.series[0].points[0][0], pressed: document.querySelector('.seg-ctl button[data-tf="1W"]').getAttribute('aria-pressed') }));
    await ctx.close();
    assert(after.k.every((t) => / 1W$/.test(t)), 'KPI labels ' + after.k.join('|'));
    assert(/1W/.test(after.x), 'chart label ' + after.x);
    assert(after.k.join() !== before.k.join(), 'KPI deltas did not change');
    assert(Math.abs((before.t0 - after.t0) - 6 * 864e5) < 2 * 864e5, 'chart window did not widen');
    assert(after.pressed === 'true', 'timeframe control state');
    return `1D ${before.k[1]} \u2192 1W ${after.k[1]}`;
  });

  await check('8.2b', 'Macro: physical overlay shows markers; marker opens rule and raw series', async () => {
    const { ctx, page } = await open('#/macro');
    await page.waitForFunction(() => TT.views.macro.chart.markerPos && TT.views.macro.chart.markerPos.length > 0, null, { timeout: 6000 });
    const n = await page.evaluate(() => TT.views.macro.chart.markerPos.length);
    const m = await page.evaluate(() => { const p = TT.views.macro.chart.markerPos[0]; const r = TT.views.macro.chart.canvas.getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y, label: p.m.label }; });
    await page.mouse.click(m.x, m.y);
    await page.waitForSelector('.popover', { timeout: 3000 });
    const pop = await page.evaluate(() => ({ t: document.querySelector('.popover').textContent, rows: TT.$$('.popover .mini-tbl tbody tr').length }));
    await page.keyboard.press('Escape');
    await page.click('#view-macro .pa > .btn');
    await page.waitForFunction(() => TT.views.macro.chart.markerPos.length === 0, null, { timeout: 5000 });
    const off = await page.evaluate(() => TT.views.macro.chart.markerPos.length);
    await ctx.close();
    assert(/DETECTION RULE/.test(pop.t) && pop.rows === 6, 'popover content');
    assert(off === 0, 'overlay toggle off still shows ' + off);
    return `${n} markers \u00b7 "${m.label}" \u00b7 6 raw passes`;
  });

  /* ===================== §8.3 Orbital ===================== */
  await check('8.3a', 'Orbital: selecting a pass updates HUD, legend count and drawer', async () => {
    const { ctx, page } = await open('#/orbital/ela-segundo-tanks/grp-b');
    await page.waitForFunction(() => TT.views.orbital.viewer.res && TT.ui.drawer() && TT.ui.drawer().kind === 'segment');
    const snap = () => page.evaluate(() => {
      const v = TT.views.orbital.viewer;
      const legend = document.querySelector('#view-orbital .orb-legend').textContent;
      const expected = v.segments.filter((s) => s.conf >= TT.app.prefs.minConf).length + '/' + v.segments.length;
      return { i: v.passIdx, hud: document.querySelector('#view-orbital .orb-hud').textContent, legendOk: legend.replace(/\s/g, '').indexOf(expected) >= 0, legend: legend, drawer: TT.ui.drawer().body.textContent };
    });
    const a = await snap();
    await blur(page);
    await page.keyboard.press('[');
    await page.waitForFunction((i) => TT.views.orbital.viewer.passIdx === i - 1, a.i, { timeout: 5000 });
    await page.waitForTimeout(200);
    const b = await snap();
    await page.selectOption('#view-orbital select[aria-label="Pass (UTC)"]', '2');
    await page.waitForFunction(() => TT.views.orbital.viewer.passIdx === 2, null, { timeout: 5000 });
    await page.waitForTimeout(200);
    const c = await snap();
    await ctx.close();
    assert(a.hud !== b.hud && b.hud !== c.hud, 'HUD pass time did not change');
    assert(a.drawer !== b.drawer && b.drawer !== c.drawer, 'drawer did not update');
    assert(a.legendOk && b.legendOk && c.legendOk, 'legend count mismatch: ' + b.legend);
    return `pass ${a.i} \u2192 ${b.i} ([) \u2192 ${c.i} (selector)`;
  });

  await check('8.3b', 'Orbital: compare slider aligns the same geography', async () => {
    const { ctx, page } = await open('#/orbital/ela-segundo-tanks');
    await page.waitForFunction(() => TT.views.orbital.viewer.res);
    await blur(page);
    await page.keyboard.press('c');
    await page.waitForFunction(() => TT.views.orbital.viewer.compare && TT.views.orbital.viewer.priorCanvas);
    const r = await page.evaluate(async () => {
      const v = TT.views.orbital.viewer;
      const a = await TT.Imagery.passCanvas(v.res.pass), b = await TT.Imagery.passCanvas(v.res.prior);
      const diff = (x, y, w, h) => { const S = a.width / 1600; const da = a.getContext('2d').getImageData(x * S, y * S, w * S, h * S).data, db = b.getContext('2d').getImageData(x * S, y * S, w * S, h * S).data; let d = 0; for (let k = 0; k < da.length; k += 4) d += Math.abs(da[k] - db[k]) + Math.abs(da[k + 1] - db[k + 1]) + Math.abs(da[k + 2] - db[k + 2]); return d / (da.length / 4); };
      const wrap = v.cmpWrap.getBoundingClientRect(), stage = v.stage.getBoundingClientRect();
      return { staticDiff: diff(1250, 600, 140, 220), dynDiff: diff(604, 40, 560, 456), aligned: Math.abs(wrap.left - stage.left - v.lastFit.ox) < 2, tag: v.cmpTag.textContent };
    });
    await ctx.close();
    assert(r.staticDiff < 1, 'static geography differs between passes: ' + r.staticDiff);
    assert(r.dynDiff > 1, 'tank group shows no change between passes');
    assert(r.aligned, 'slider not aligned to imagery');
    return `static region diff ${r.staticDiff.toFixed(2)} \u00b7 tank group diff ${r.dynDiff.toFixed(1)} \u00b7 ${r.tag}`;
  });

  await check('8.3c', 'Orbital: play loops through the last 6 passes', async () => {
    const { ctx, page } = await open('#/orbital/san-pedro-port');
    await page.waitForFunction(() => TT.views.orbital.viewer.res);
    await blur(page);
    await page.keyboard.press('p');
    const seen = new Set();
    for (let k = 0; k < 14; k++) { seen.add(await page.evaluate(() => TT.views.orbital.viewer.passIdx)); await page.waitForTimeout(300); }
    const pressed = await page.getAttribute('#view-orbital .orb-ctl button[aria-pressed]:nth-of-type(3)', 'aria-pressed').catch(() => null);
    await page.keyboard.press('p');
    const stopped = await page.evaluate(() => !TT.views.orbital.viewer.playing);
    await ctx.close();
    assert(seen.size >= 3, 'passes seen ' + Array.from(seen).join(','));
    assert(stopped, 'loop did not stop');
    return `visited passes ${Array.from(seen).sort().join(',')}`;
  });

  await check('8.3d', 'Orbital: drawer shows class, confidence, area, change, prior thumbnail, Ask agent', async () => {
    const { ctx, page } = await open('#/orbital/ela-segundo-tanks/grp-b');
    await page.waitForFunction(() => TT.ui.drawer() && TT.ui.drawer().kind === 'segment');
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const d = TT.ui.drawer().el;
      const c = d.querySelector('.thumbs canvas');
      const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let sum = 0; for (let k = 0; k < px.length; k += 4) sum += px[k] + px[k + 1] + px[k + 2];
      return { text: d.textContent, bright: sum / (px.length / 4) / 3, ask: !!d.querySelector('.drawer-acts .btn-amber'), cap: d.querySelector('.thumbs figcaption').textContent };
    });
    await ctx.close();
    ['Confidence', 'Area', 'Change vs prior pass', 'Class', 'DETECTION RULE', 'SENSOR', 'MODEL'].forEach((k) => assert(r.text.indexOf(k) >= 0, 'missing ' + k));
    assert(/0\.87/.test(r.text) && /11\.4 pp/.test(r.text), 'expected confidence 0.87 and -11.4 pp');
    assert(r.bright > 40 && /PRIOR/.test(r.cap), 'prior thumbnail blank');
    assert(r.ask, 'no Ask agent button');
    return `confidence 0.87 \u00b7 \u221211.4 pp \u00b7 prior thumbnail brightness ${r.bright.toFixed(0)}`;
  });

  await check('8.3e', 'Orbital: min confidence 0.80 by default; class isolate; text alternative', async () => {
    const { ctx, page } = await open('#/orbital/ela-segundo-tanks');
    await page.waitForFunction(() => TT.views.orbital.viewer.res);
    const r = await page.evaluate(() => {
      const v = TT.views.orbital.viewer;
      const vis = v.visible();
      return { min: TT.app.prefs.minConf, low: vis.filter((s) => s.conf < 0.8).length, hidden: v.segments.length - vis.length, rows: TT.$$('#view-orbital .seglist-wrap tr.row').length, vis: vis.length };
    });
    await page.click('#view-orbital .orb-legend .lg[data-cls="logistics"]');
    const iso = await page.evaluate(() => TT.views.orbital.viewer.visible().every((s) => s.cls === 'logistics'));
    await ctx.close();
    assert(r.min === 0.8 && r.low === 0 && r.hidden > 0, JSON.stringify(r));
    assert(r.rows === r.vis, 'segment list rows ' + r.rows + ' vs visible ' + r.vis);
    assert(iso, 'isolate failed');
    return `${r.hidden} low-confidence segments hidden \u00b7 list mirrors ${r.vis} visible`;
  });

  /* ===================== §8.4 Agent ===================== */
  await check('8.4a', 'Agent: "Brief me" streams, cites panels, numeric confidence, under 5 paragraphs', async () => {
    const { ctx, page } = await open();
    await page.fill('#panel-agent .composer input', 'Brief me');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#panel-agent .msg.agent .reasoning', { timeout: 3000 });
    await page.waitForFunction(() => TT.app.chat.some((m) => m.role === 'agent' && m.streaming && !m.reasoning && m.text.length > 0), null, { timeout: 6000 });
    await page.waitForFunction(() => !TT.app.asking, null, { timeout: 20000 });
    await page.waitForTimeout(100);
    const r = await page.evaluate(() => {
      const el = TT.$$('#panel-agent .msg.agent').pop();
      return { paras: el.querySelectorAll('.body p').length, src: el.querySelectorAll('.foot button.src').length, conf: el.querySelector('.conf-val').textContent, live: document.querySelector('#panel-agent .sr-only[aria-live]').textContent };
    });
    await ctx.close();
    assert(r.paras >= 2 && r.paras <= 5, 'paragraphs ' + r.paras);
    assert(r.src >= 1, 'no sources');
    assert(/^0\.\d\d$/.test(r.conf), 'confidence ' + r.conf);
    assert(/Confidence/.test(r.live), 'live region not announced');
    return `${r.paras} paragraphs \u00b7 ${r.src} sources \u00b7 confidence ${r.conf}`;
  });

  await check('8.4b', 'Agent: tank drawdown answer fuses imagery with crude, cites both', async () => {
    const { ctx, page } = await open();
    const m = await askAndWait(page, 'Explain the tank drawdown');
    await ctx.close();
    assert(/WTI is \+\d\.\d\d%/.test(m.text) && /correlate at/.test(m.text), 'answer lacks crude fusion');
    assert(m.sources.some((s) => /El Segundo/.test(s.label)) && m.sources.some((s) => /WTI/.test(s.label)), 'sources ' + JSON.stringify(m.sources));
    return m.text.match(/WTI is \S+/)[0] + ' \u00b7 correlation ' + m.text.match(/correlate at (\S+),/)[1] + ' \u00b7 conf ' + m.confidence;
  });

  await check('8.4c', 'Agent: says what is missing instead of inventing; refuses trade orders', async () => {
    const { ctx, page } = await open();
    const a = await askAndWait(page, 'What is the weather in Paris tomorrow?');
    const b = await askAndWait(page, 'Should I buy crude now?');
    await ctx.close();
    assert(/don\u2019t have data/.test(a.text) && a.missing.length && a.confidence < 0.5, 'unknown answer');
    assert(/don\u2019t give trade instructions/.test(b.text), 'guardrail missing');
    return `unknown \u2192 conf ${a.confidence}, missing "${a.missing[0]}" \u00b7 trade order declined`;
  });

  /* ===================== §8.5 Capital flow ===================== */
  await check('8.5', 'Flow: hover shows exact values; ABS/SHARE re-renders without reload', async () => {
    const { ctx, page } = await open('#/flow');
    await page.waitForFunction(() => TT.views.flow.chart && TT.views.flow.chart.data);
    await page.evaluate(() => { window.__nonce = 42; });
    const box = await page.locator('#view-flow .chart canvas').boundingBox();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
    const abs = await page.textContent('#view-flow .chart-readout');
    await page.click('#view-flow .seg-ctl button[data-mode="share"]');
    await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.5);
    const share = await page.textContent('#view-flow .chart-readout');
    const nonce = await page.evaluate(() => window.__nonce);
    await page.click('#view-flow .seg-ctl button[data-mode="abs"]');
    await ctx.close();
    assert(/Equities[\d,]+\.\d/.test(abs.replace(/\s/g, '')), 'abs readout ' + abs);
    assert(/Total100\.0%/.test(share.replace(/\s/g, '')) && /%/.test(share), 'share readout ' + share);
    assert(nonce === 42, 'page reloaded');
    return abs.replace(/\s+/g, ' ').slice(0, 60) + '\u2026';
  });

  /* ===================== §8.6 Commodities and FX ===================== */
  await check('8.6a', 'Commodities: 200 rows, sort is instant', async () => {
    const { ctx, page } = await open('#/commodities');
    await page.waitForFunction(() => TT.views.commodities.rows && TT.views.commodities.rows.size === 200, null, { timeout: 6000 });
    const t0 = Date.now();
    await page.click('#view-commodities th[data-k="px"] button');
    const wall = Date.now() - t0;
    const r = await page.evaluate(() => {
      const nums = TT.$$('#view-commodities tbody tr.row').map((tr) => parseFloat(tr.children[3].textContent.replace(/,/g, '')));
      let sorted = true; for (let k = 1; k < nums.length; k++) if (nums[k] > nums[k - 1]) sorted = false;
      return { ms: TT.views.commodities.lastSortMs, n: nums.length, sorted: sorted, aria: document.querySelector('#view-commodities th[data-k="px"]').getAttribute('aria-sort') };
    });
    await page.click('#view-commodities th[data-k="sym"] button');
    const alpha = await page.evaluate(() => { const s = TT.$$('#view-commodities tbody tr.row').map((tr) => tr.dataset.sym); return s.every((v, k) => !k || s[k - 1].localeCompare(v) <= 0); });
    await ctx.close();
    assert(r.n === 200 && r.sorted && r.aria === 'descending', JSON.stringify(r));
    assert(r.ms < 50, 'sort took ' + r.ms.toFixed(1) + ' ms');
    assert(alpha, 'symbol sort not ascending');
    return `200 rows sorted in ${r.ms.toFixed(1)} ms (click to paint ${wall} ms)`;
  });

  await check('8.6b', 'Commodities: selection syncs with the watchlist pin', async () => {
    const { ctx, page } = await open('#/commodities');
    await page.waitForFunction(() => TT.views.commodities.rows && TT.views.commodities.rows.size === 200);
    await page.click('#view-commodities tr[data-sym="CLZ6"] button.pin');
    const a = await page.evaluate(() => TT.app.isWatched('CLZ6'));
    await go(page, 'desk');
    await page.waitForSelector('#panel-watch tr[data-sym="CLZ6"]', { timeout: 4000 });
    await page.focus('#panel-watch tr[data-sym="CLZ6"]');
    await page.keyboard.press('Delete');
    const b = await page.evaluate(() => TT.app.isWatched('CLZ6'));
    await go(page, 'commodities');
    const pinOn = await page.evaluate(() => document.querySelector('#view-commodities tr[data-sym="CLZ6"] button.pin').classList.contains('on'));
    await page.click('#view-commodities tr[data-sym="CLZ6"]');
    await page.waitForFunction(() => TT.ui.drawer() && TT.ui.drawer().kind === 'symbol');
    const drawer = await page.evaluate(() => TT.ui.drawer().el.textContent);
    await ctx.close();
    assert(a && !b && !pinOn, `pinned ${a}, removed ${!b}, table cleared ${!pinOn}`);
    assert(/CLZ6/.test(drawer) && /PIN/.test(drawer), 'chart drawer');
    return 'pin in F5 \u2192 desk row \u2192 Delete \u2192 F5 cleared \u2192 chart drawer';
  });

  await check('8.6c', 'FX: 200 pairs at 4 decimals, sortable', async () => {
    const { ctx, page } = await open('#/fx');
    await page.waitForFunction(() => TT.views.fx.rows && TT.views.fx.rows.size === 200, null, { timeout: 6000 });
    await page.click('#view-fx th[data-k="chgPct"] button');
    const r = await page.evaluate(() => ({ ms: TT.views.fx.lastSortMs, fmt: TT.$$('#view-fx tbody tr.row').every((tr) => /^[\d,]+\.\d{4}$/.test(tr.children[3].textContent)) }));
    await ctx.close();
    assert(r.fmt, 'FX not at 4 decimals');
    assert(r.ms < 50, 'sort ' + r.ms);
    return `sorted in ${r.ms.toFixed(1)} ms`;
  });

  /* ===================== §8.7 Satellite intel ===================== */
  await check('8.7', 'Satellite intel: clicking a site opens Orbital with segments loaded', async () => {
    const { ctx, page } = await open('#/intel');
    await page.waitForSelector('#view-intel tr.row[data-site="san-pedro-port"]');
    const cols = await page.evaluate(() => TT.$$('#view-intel tr.row').length);
    await page.click('#view-intel tr.row[data-site="san-pedro-port"]');
    await page.waitForFunction(() => TT.router.current.view === 'orbital' && TT.views.orbital.viewer.res && TT.views.orbital.viewer.res.site.id === 'san-pedro-port', null, { timeout: 6000 });
    const n = await page.evaluate(() => ({ segs: TT.views.orbital.viewer.segments.length, rows: TT.$$('#view-orbital .seglist-wrap tr.row').length }));
    await ctx.close();
    assert(cols === 6 && n.segs > 0 && n.rows > 0, JSON.stringify(n));
    return `${cols} sites \u00b7 San Pedro Bay with ${n.segs} segments`;
  });

  /* ===================== §8.8 Alerts ===================== */
  await check('8.8a', 'Alerts: new alert arrives with toast and status count; acknowledge clears both', async () => {
    const { ctx, page } = await open();
    const n0 = Number(await page.textContent('.status .sb b:not(:empty) >> nth=-1').catch(() => '0')) || await page.evaluate(() => TT.app.activeAlerts().length);
    const c0 = await page.evaluate(() => TT.app.activeAlerts().length);
    await page.evaluate(() => window.TERRATERM.debug.fireScheduled());
    await page.waitForSelector('.toast[data-id="alert-al-port-anch"]', { timeout: 6000 });
    const c1 = await page.evaluate(() => ({ n: TT.app.activeAlerts().length, sb: document.querySelector('.status button.sb:nth-of-type(2) b') ? document.querySelector('.status button.sb:nth-of-type(2) b').textContent : '', sys: TT.app.chat.some((m) => m.role === 'system' && /ANCHORAGE/.test(m.text)) }));
    await go(page, 'alerts');
    await page.click('#view-alerts tr[data-id="al-port-anch"] td:last-child button');
    const c2 = await page.evaluate(() => ({ n: TT.app.activeAlerts().length, toast: !!document.querySelector('.toast[data-id="alert-al-port-anch"]'), sb: TT.$$('.status button.sb')[1].querySelector('b').textContent }));
    await ctx.close();
    assert(c1.n === c0 + 2, `count ${c0} \u2192 ${c1.n}`);
    assert(c1.sys, 'agent did not post a proactive system message');
    assert(c2.n === c1.n - 1 && !c2.toast && Number(c2.sb) === c2.n, `after ack ${JSON.stringify(c2)}`);
    return `active ${c0} \u2192 ${c1.n} (toast, agent log) \u2192 ${c2.n} after ACKNOWLEDGE`;
  });

  await check('8.8b', 'Alerts: rules builder fires on threshold plus channel', async () => {
    const { ctx, page } = await open('#/alerts');
    await page.selectOption('#rule-sym', 'CL1');
    await page.selectOption('#rule-metric', 'chgPct');
    await page.selectOption('#rule-op', '>');
    await page.fill('#rule-thr', '0.5');
    await page.selectOption('#rule-ch', 'both');
    await page.click('#view-alerts form button[type="submit"]');
    await page.waitForFunction(() => TT.app.alerts.some((a) => a.subject === 'CL1 \u00b7 RULE'), null, { timeout: 5000 });
    const r = await page.evaluate(() => ({ rules: TT.app.rules.length, fired: TT.app.rules.some((r) => !r.armed) }));
    await ctx.close();
    assert(r.fired, 'rule not marked fired');
    return `${r.rules} rules \u00b7 CL1 rule fired`;
  });

  /* ===================== §8.9 Wire ===================== */
  await check('8.9', 'Wire: headline expands summary and source; geo items deep link to Orbital; filters', async () => {
    const { ctx, page } = await open();
    await page.waitForSelector('#panel-watch .wire-item');
    await page.click('#panel-watch .wire-item:first-child > button');
    const exp = await page.evaluate(() => { const li = document.querySelector('#panel-watch .wire-item'); return { e: li.querySelector('button').getAttribute('aria-expanded'), more: !!li.querySelector('.wire-more'), src: /SOURCE/.test(li.textContent) }; });
    await page.click('#panel-watch .seg-ctl button[data-tag="geo"]');
    const tags = await page.evaluate(() => TT.$$('#panel-watch .wire-item .tag').map((t) => t.textContent));
    await page.click('#panel-watch .wire-item:first-child > button');
    await page.click('#panel-watch .wire-item:first-child .wire-more button.geo');
    await page.waitForFunction(() => TT.router.current.view === 'orbital' && TT.views.orbital.viewer.res);
    const site = await page.evaluate(() => TT.views.orbital.viewer.site);
    await ctx.close();
    assert(exp.e === 'true' && exp.more && exp.src, 'expand ' + JSON.stringify(exp));
    assert(tags.length && tags.every((t) => t === 'geo'), 'geo filter ' + tags.join(','));
    return `expanded with source \u00b7 ${tags.length} geo items \u00b7 deep link \u2192 ${site}`;
  });

  /* ===================== §8.10 System ===================== */
  await check('8.10', 'System: context bar amber past 70%, red past 90%; scaffold wiring hint', async () => {
    const { ctx, page } = await open();
    const cls = async (n) => { await page.evaluate((v) => { window.TERRATERM.debug.setContext(v); return TT.app.pollers.system.now(); }, n); await page.waitForTimeout(150); return page.evaluate(() => [document.querySelector('#panel-system .ctxbar-big').className, document.querySelector('.status .ctx-mini').className]); };
    const lo = await cls(500000), mid = await cls(750000), hi = await cls(950000);
    const hint = await page.evaluate(() => { const h = document.querySelector('#panel-system .hint'); return !h.hidden && /window\.TERRATERM\.api/.test(h.textContent); });
    await ctx.close();
    assert(!/warn|crit/.test(lo[0]) && /warn/.test(mid[0]) && /crit/.test(hi[0]), [lo, mid, hi].join(' | '));
    assert(/warn/.test(mid[1]) && /crit/.test(hi[1]), 'status bar mini meter');
    assert(hint, 'wiring hint');
    return '50% blue \u00b7 75% amber \u00b7 95% red';
  });

  /* ===================== §7 Navigation ===================== */
  await check('7a', 'Navigation: F1 to F8 and Alt+digits switch views; function bar marks the active view', async () => {
    const { ctx, page } = await open();
    const ids = ['macro', 'orbital', 'agent', 'flow', 'commodities', 'fx', 'intel', 'alerts'];
    for (let k = 0; k < 8; k++) {
      await blur(page);
      await page.keyboard.press('F' + (k + 1));
      const v = await view(page);
      const cur = await page.getAttribute('.fbar a[aria-current="page"]', 'data-view');
      assert(v === ids[k] && cur === ids[k], `F${k + 1} \u2192 ${v}/${cur}`);
    }
    await blur(page);
    await page.keyboard.press('Alt+Digit3');
    const a3 = await view(page);
    await page.keyboard.press('Alt+Digit0');
    const a0 = await view(page);
    await ctx.close();
    assert(a3 === 'agent' && a0 === 'desk', `Alt+3 ${a3}, Alt+0 ${a0}`);
    return 'F1\u2013F8, Alt+3, Alt+0';
  });

  await check('7b', 'Navigation: every view is URL addressable, including bare-token links', async () => {
    const out = [];
    for (const [hash, test] of [
      ['#/orbital/ela-segundo-tanks', () => TT.router.current.view === 'orbital' && TT.views.orbital.viewer.site === 'ela-segundo-tanks'],
      ['#orbital.san-pedro-port', () => TT.router.current.view === 'orbital' && TT.views.orbital.viewer.site === 'san-pedro-port'],
      ['#/commodities/CLZ6', () => TT.ui.drawer() && /CLZ6/.test(TT.ui.drawer().el.textContent)],
      ['#macro', () => TT.router.current.view === 'macro'],
      ['#/alerts', () => TT.router.current.view === 'alerts'],
    ]) {
      const { ctx, page } = await open(hash, { wait: false });
      await page.waitForFunction(test, null, { timeout: 8000 });
      out.push(hash);
      await ctx.close();
    }
    return out.join('  ');
  });

  await check('7c', 'Navigation: "/" palette fuzzy search, arrows, Enter, digits 1 to 8', async () => {
    const { ctx, page } = await open();
    await blur(page);
    await page.keyboard.press('/');
    await page.waitForSelector('#palette-input');
    await page.keyboard.type('port');
    const first = await page.textContent('.pal-item[aria-selected="true"] .lbl');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => TT.router.current.view === 'orbital' && TT.views.orbital.viewer.site === 'san-pedro-port', null, { timeout: 5000 });
    await blur(page);
    await page.keyboard.press('/');
    await page.keyboard.press('ArrowDown');
    const sel = await page.getAttribute('#palette-input', 'aria-activedescendant');
    await page.keyboard.press('5');
    const v = await view(page);
    await ctx.close();
    assert(/San Pedro Bay/.test(first), 'first result ' + first);
    assert(sel === 'pal-opt-1', 'arrow selection ' + sel);
    assert(v === 'commodities', 'digit 5 \u2192 ' + v);
    return `"port" \u2192 ${first} \u00b7 5 \u2192 commodities`;
  });

  await check('7d', 'Navigation: "?" shortcut sheet; Esc closes it and returns focus; Esc returns to last panel', async () => {
    const { ctx, page } = await open();
    await page.focus('#panel-watch tr.row');
    await page.keyboard.press('?');
    await page.waitForSelector('.modal[role="dialog"]');
    const title = await page.textContent('.modal .pt');
    await page.keyboard.press('Escape');
    const back = await page.evaluate(() => !document.querySelector('.modal') && document.activeElement.matches('#panel-watch tr.row'));
    await page.keyboard.press('Escape');
    const panel = await page.evaluate(() => document.activeElement.id);
    await ctx.close();
    assert(title === 'KEYBOARD' && back, 'sheet/focus restore');
    assert(panel === 'panel-watch', 'Esc focus ' + panel);
    return 'sheet \u2192 Esc \u2192 row \u2192 Esc \u2192 #panel-watch';
  });

  /* ===================== §13 States ===================== */
  await check('13a', 'States: feed outage shows red dot, stale ribbon, "Feed disconnected. Retrying." and recovers', async () => {
    const { ctx, page } = await open();
    await page.evaluate(() => window.TERRATERM.debug.feed(false));
    await page.waitForFunction(() => TT.app.feed.status === 'down', null, { timeout: 6000 });
    await page.waitForTimeout(200);
    const down = await page.evaluate(() => ({ dot: document.querySelector('.status .sb .dot').className, ribbon: !document.querySelector('#panel-watch .ribbon').hidden && document.querySelector('#panel-watch .ribbon').textContent, err: document.querySelector('#panel-watch .panel-error').textContent, rows: TT.$$('#panel-watch tr.row').length }));
    await page.evaluate(() => window.TERRATERM.debug.feed(true));
    await page.click('#panel-watch .panel-error button');
    await page.waitForFunction(() => TT.app.feed.status === 'live', null, { timeout: 6000 });
    const toast = await page.waitForSelector('.toast >> text=Feed reconnected.', { timeout: 3000 }).then(() => true).catch(() => false);
    const ribbonGone = await page.evaluate(() => document.querySelector('#panel-watch .ribbon').hidden);
    await ctx.close();
    assert(/st-down/.test(down.dot), 'dot ' + down.dot);
    assert(/STALE/.test(down.ribbon), 'ribbon ' + down.ribbon);
    assert(/Feed disconnected\. Retrying\./.test(down.err) && /RETRY/.test(down.err), 'error ' + down.err);
    assert(down.rows >= 10, 'last known data not kept');
    assert(toast && ribbonGone, 'recovery');
    return `${down.ribbon} \u00b7 last data kept (${down.rows} rows) \u00b7 recovered`;
  });

  await check('13b', 'States: data older than 15 minutes is marked stale automatically', async () => {
    const { ctx, page } = await open();
    const r = await page.evaluate(() => {
      TT.app.pollers.quotes.stop();
      TT.app.quotesAsOf = Date.now() - 16 * 60000;
      TT.bus.emit('tick', Date.now());
      return { fn: TT.app.isStale(Date.now() - 16 * 60000) && !TT.app.isStale(Date.now() - 60000), ribbon: !document.querySelector('#panel-watch .ribbon').hidden };
    });
    await ctx.close();
    assert(r.fn && r.ribbon, JSON.stringify(r));
    return '16-minute-old quotes show the stale ribbon';
  });

  await check('13c', 'States: table skeleton rows for at least 400 ms; imagery shows "Loading pass\u2026"', async () => {
    const { ctx, page } = await open();
    const t = await page.evaluate(async () => {
      TT.router.go('commodities');
      const t0 = performance.now();
      const skel = TT.$$('#view-commodities tr.skel').length;
      while (!TT.$$('#view-commodities tr.row').length) await new Promise((r) => setTimeout(r, 20));
      return { skel: skel, ms: performance.now() - t0 };
    });
    const load = await page.evaluate(() => { TT.router.go('orbital/gary-works'); const l = document.querySelector('#view-orbital .orb-loading'); return !l.hidden && /Loading pass/.test(l.textContent); });
    await ctx.close();
    assert(t.skel > 0 && t.ms >= 380, JSON.stringify(t));
    assert(load, 'imagery placeholder not shown');
    return `${t.skel} skeleton rows for ${Math.round(t.ms)} ms \u00b7 imagery placeholder shown`;
  });

  await check('13d', 'States: empty states use the blueprint microcopy', async () => {
    const { ctx, page } = await open('#/alerts');
    await page.evaluate(() => TT.app.ackAll());
    const a = await page.textContent('#view-alerts tbody');
    await go(page, 'desk');
    await page.evaluate(() => { TT.app.watch.slice().forEach((s) => TT.app.toggleWatch(s, false)); });
    const w = await page.textContent('#panel-watch tbody');
    await ctx.close();
    assert(/No alerts\. The agent is watching\./.test(a), a);
    assert(/Pin symbols to build your watchlist\./.test(w), w);
    return 'alerts and watchlist empty states';
  });

  /* ===================== §14 Motion ===================== */
  await check('14', 'Motion: reduced motion disables pulse, flash and transitions', async () => {
    const { ctx, page } = await open('', { context: { reducedMotion: 'reduce' } });
    const r = await page.evaluate(() => {
      const td = document.querySelector('#panel-watch td.num');
      TT.ui.flash(td, 1);
      return { motion: document.documentElement.dataset.motion, flashed: td.classList.contains('flash-up'), anim: getComputedStyle(document.querySelector('.dot')).animationName };
    });
    await ctx.close();
    assert(r.motion === 'reduce' && !r.flashed && r.anim === 'none', JSON.stringify(r));
    return 'data-motion=reduce, no flash, no pulse';
  });

  /* ===================== §15 Accessibility ===================== */
  await check('15a', 'Accessibility: axe-core finds no serious or critical issues on any view', async () => {
    const { ctx, page } = await open();
    await page.addScriptTag({ content: AXE });
    const all = [];
    for (const v of ['desk', 'macro', 'orbital', 'agent', 'flow', 'commodities', 'fx', 'intel', 'alerts']) {
      await go(page, v);
      await page.waitForTimeout(v === 'orbital' || v === 'commodities' || v === 'fx' ? 1400 : 600);
      const res = await page.evaluate(async () => { const r = await window.axe.run(document, { resultTypes: ['violations'] }); return r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical').map((x) => x.id + '(' + x.nodes.length + '): ' + x.nodes.slice(0, 2).map((n) => n.target.join(' ') + ' ' + (n.failureSummary || '').split('\n')[1]).join(' ; ')); });
      res.forEach((x) => all.push(v + ' ' + x));
    }
    await ctx.close();
    if (all.length) console.log('      ' + all.join('\n      '));
    assert(!all.length, all.length + ' issues');
    return '9 views clean';
  });

  await check('15b', 'Accessibility: amber 2px focus ring; direction never by color alone; live region', async () => {
    const { ctx, page } = await open();
    await page.focus('.fbar a[data-view="macro"]');
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineColor + ' ' + s.outlineWidth + ' ' + s.outlineStyle; });
    const glyphs = await page.evaluate(() => TT.$$('#panel-watch tr.row td:nth-child(4)').every((td) => /[\u25B2\u25BC\u25A0]/.test(td.textContent)));
    const live = await page.evaluate(() => !!document.querySelector('#panel-agent [aria-live="polite"]'));
    await ctx.close();
    assert(/rgb\(255, 159, 28\) 2px solid/.test(ring), 'focus ring ' + ring);
    assert(glyphs, 'change cells lack triangles');
    assert(live, 'no live region');
    return ring;
  });

  await check('15c', 'Accessibility: touch targets at least 32 px on touch devices', async () => {
    const { ctx, page } = await open('', { context: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } });
    const r = await page.evaluate(() => ({ min: Math.min.apply(null, TT.$$('.btn, .chip, .seg-ctl button, .fbar a').filter((e) => e.offsetParent !== null).map((e) => e.getBoundingClientRect().height)), sw: document.scrollingElement.scrollWidth }));
    await ctx.close();
    assert(r.min >= 32, 'smallest target ' + r.min);
    assert(r.sw <= 390, 'horizontal scroll ' + r.sw);
    return `smallest visible target ${Math.round(r.min)} px, no horizontal scroll at 390 px`;
  });

  /* ===================== §16 Performance ===================== */
  await check('16a', 'Performance: first paint under 1 second', async () => {
    const { ctx, page } = await open('', { wait: false });
    await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length || performance.getEntriesByType('paint').length, null, { timeout: 5000 });
    const fcp = await page.evaluate(() => { const e = performance.getEntriesByType('paint').find((x) => x.name === 'first-contentful-paint') || performance.getEntriesByType('paint')[0]; return e.startTime; });
    await ready(page);
    await ctx.close();
    assert(fcp < 1000, 'FCP ' + fcp);
    return `first contentful paint ${Math.round(fcp)} ms`;
  });

  await check('16b', 'Performance: quotes update at most 4 per second; charts re-render at most 2 per second', async () => {
    const { ctx, page } = await open();
    await page.waitForTimeout(800); // let the one-time series fade-in (§13) finish
    const r = await page.evaluate(async () => {
      let q = 0; const off = TT.bus.on('quotes', () => q++);
      const chart = TT.views.desk.parts.flow.chart;
      let renders = 0; const orig = chart.render.bind(chart); chart.render = function () { renders++; return orig(); };
      const d = chart.data;
      for (let k = 0; k < 40; k++) { chart.setData(Object.assign({}, d)); await new Promise((r) => setTimeout(r, 25)); }
      await new Promise((r) => setTimeout(r, 1000));
      off(); chart.render = orig;
      return { q: q, renders: renders };
    });
    await ctx.close();
    assert(r.q <= 4 * 2.1, 'quote updates ' + r.q + ' in 2s');
    assert(r.renders <= 5, 'chart renders ' + r.renders + ' in 2s of 40 data updates');
    return `${r.q} quote updates and ${r.renders} chart renders over 2 s`;
  });

  /* ===================== §4 Responsive ===================== */
  await check('4', 'Responsive: below 1100 px bottom row hides and 2 columns; below 800 px single column, view only', async () => {
    const { ctx, page } = await open('', { context: { viewport: { width: 1000, height: 800 } } });
    const a = await page.evaluate(() => ({ cols: getComputedStyle(document.querySelector('.desk')).gridTemplateColumns.split(' ').length, hidden: TT.$$('.desk > .panel').filter((p) => getComputedStyle(p).display === 'none').length, sw: document.scrollingElement.scrollWidth }));
    await page.setViewportSize({ width: 700, height: 800 });
    await page.waitForTimeout(200);
    const b = await page.evaluate(() => ({ disp: getComputedStyle(document.querySelector('.desk')).flexDirection, composer: getComputedStyle(document.querySelector('#panel-agent .composer')).display, viewonly: getComputedStyle(document.querySelector('#panel-agent .viewonly')).display, sw: document.scrollingElement.scrollWidth }));
    await page.setViewportSize({ width: 400, height: 800 });
    await page.waitForTimeout(200);
    const c = await page.evaluate(() => { const main = document.getElementById('main'); return { sw: document.scrollingElement.scrollWidth, mw: main.scrollWidth <= main.clientWidth + 1 }; });
    await ctx.close();
    assert(a.cols === 2 && a.hidden === 3 && a.sw <= 1000, JSON.stringify(a));
    assert(b.disp === 'column' && b.composer === 'none' && b.viewonly === 'block' && b.sw <= 700, JSON.stringify(b));
    assert(c.sw <= 400 && c.mw, JSON.stringify(c));
    return '1000 px: 2 columns, bottom row hidden \u00b7 700 px: stack, view only \u00b7 400 px: no side scroll';
  });

  /* ===================== §17 step 9 layout + §2 persistence ===================== */
  await check('17', 'Layout: panels resize and reorder by keyboard; layout survives reload; reset works', async () => {
    const { ctx, page } = await open();
    await page.focus('.rz-c1');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.focus('#panel-watch');
    await page.keyboard.press('Alt+Shift+ArrowRight');
    const before = await page.evaluate(() => ({ col: document.querySelector('.desk').style.getPropertyValue('--col-l'), slot: document.querySelector('#panel-watch').dataset.slot }));
    await page.reload(); await ready(page);
    const after = await page.evaluate(() => ({ col: document.querySelector('.desk').style.getPropertyValue('--col-l'), slot: document.querySelector('#panel-watch').dataset.slot }));
    await page.evaluate(() => TT.views.desk.layout.reset());
    const reset = await page.evaluate(() => document.querySelector('#panel-watch').dataset.slot + ' ' + document.querySelector('.desk').style.getPropertyValue('--col-l'));
    await ctx.close();
    assert(before.col === '332px' && before.slot === '1', JSON.stringify(before));
    assert(after.col === '332px' && after.slot === '1', 'not persisted ' + JSON.stringify(after));
    assert(reset === '0 300px', 'reset ' + reset);
    return 'left column 300 \u2192 332 px, watchlist moved to slot 1, both persisted, reset restores';
  });

  await check('2', 'Persistence: pins, conversation and preferences survive reload', async () => {
    const { ctx, page } = await open();
    await page.click('#panel-watch tr[data-sym="HG1"]');
    await askAndWait(page, 'How is copper?');
    await blur(page);
    await page.keyboard.press('t');
    await page.reload(); await ready(page);
    const r = await page.evaluate(() => ({ pin: TT.app.isPinned('symbol', 'HG1'), chat: TT.app.chat.length, rendered: TT.$$('#panel-agent .msg.agent').length, tape: !document.querySelector('.tape').hidden, ctx: /HG1/.test(document.querySelector('#panel-agent .ctxbar').textContent) }));
    await ctx.close();
    assert(r.pin && r.ctx && r.chat >= 2 && r.rendered >= 1 && r.tape, JSON.stringify(r));
    return `HG1 pinned, ${r.chat} messages, tape on`;
  });

  /* ===================== §18 Demo ===================== */
  await check('18', 'Demo: 90-second run, one keypress per beat, keyboard only', async () => {
    const { ctx, page } = await open('#demo');
    const t0 = Date.now();
    const b1 = await page.evaluate(() => ({ badge: !document.querySelector('.badge').hidden, view: TT.router.current.view, cl: document.querySelector('#panel-macro .kpi[data-sym="CL1"] .k-c').textContent }));
    await blur(page);
    await page.keyboard.press('n');
    await page.waitForFunction(() => TT.ui.drawer() && TT.ui.drawer().kind === 'segment', null, { timeout: 5000 });
    const b2 = await page.evaluate(() => TT.ui.drawer().el.textContent);
    await blur(page);
    await page.keyboard.press('n');
    await page.waitForFunction(() => TT.app.chat.some((m) => m.role === 'agent') && !TT.app.asking, null, { timeout: 20000 });
    const b3 = await page.evaluate(() => TT.app.chat.filter((m) => m.role === 'agent').pop());
    await blur(page);
    await page.keyboard.press('n');
    await page.waitForFunction(() => TT.router.current.view === 'orbital' && TT.views.orbital.viewer.site === 'san-pedro-port' && TT.views.orbital.viewer.playing, null, { timeout: 8000 });
    await page.waitForTimeout(1500);
    await blur(page);
    await page.keyboard.press('n');
    await page.waitForFunction(() => TT.router.current.view === 'macro', null, { timeout: 5000 });
    const b5 = await page.textContent('.status');
    const secs = (Date.now() - t0) / 1000;
    await ctx.close();
    assert(b1.badge && b1.view === 'desk' && /\+2\.31%/.test(b1.cl), 'beat 1 ' + JSON.stringify(b1));
    assert(/DRAWDOWN/.test(b2) && /0\.87/.test(b2), 'beat 2 drawer');
    assert(/WTI is \+2\.31%/.test(b3.text) && b3.sources.length && typeof b3.confidence === 'number', 'beat 3 answer');
    assert(/Glimmer 30B local/.test(b5) && /184K \/ 1M/.test(b5), 'beat 5 status bar: ' + b5.replace(/\s+/g, ' '));
    assert(secs < 90, 'run took ' + secs);
    return `5 beats in ${secs.toFixed(0)} s \u00b7 crude +2.31% \u00b7 confidence ${b3.confidence} \u00b7 184K / 1M`;
  });

  /* ===================== console ===================== */
  /* ===================== Regression checks for the 2026-10-26 audit ===================== */
  const LIVE_BASE = `
    const now = () => Date.now();
    const KS = ['SPX', 'CL1', 'HG1', 'US10Y', 'DXY', 'VIX'], SLOTS = ['Index', 'Commodity', 'Metal', 'Yield', 'Dollar', 'Vol'];
    const q = (sym, px) => ({ sym: sym, name: sym + ' live', kind: 'index', px: px, prev: px - 1, chg: 1, chgPct: 1 / (px - 1), hi: px + 1, lo: px - 2, ts: now() });
    const img = () => { const c = document.createElement('canvas'); c.width = 160; c.height = 100; c.getContext('2d').fillRect(0, 0, 160, 100); return c.toDataURL(); };
    const site = (id) => ({ id: id, name: 'Live ' + id, short: 'LV', type: 'Tank farm', region: 'Test', cls: 'energy' });
    window.__live = {
      watchlist: async () => ({ asOf: now(), source: 'live', quotes: KS.map((s, k) => q(s, 100 + k)) }),
      macro: async ({ tf }) => ({ asOf: now(), source: 'live', tf: tf, kpis: KS.map((s, k) => ({ slot: SLOTS[k], sym: s, name: s, kind: 'index', value: 100 + k, chg: 1, chgPct: 0.01 })), series: KS.map((s) => ({ id: s, name: s, kind: 'index', points: [[now() - 864e5, 100], [now(), 101]] })), signals: [] }),
      imagery: async ({ site: id }) => ({ asOf: now(), site: site(id || 'live-site'), passes: [{ id: 'p0', i: 0, ts: now() - 6e5 }], pass: { id: 'p0', i: 0, ts: now() - 6e5, sensor: 'TEST', gsd: 0.5, model: 'm', imageUrl: img(), segments: [] }, prior: null }),
      ask: async ({ prompt, onToken }) => { const t = 'Live: ' + prompt; onToken && onToken(t, t); return { text: t, sources: [], confidence: 0.5 }; },
    };`;
  async function openLive(setup, hash, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    if (opts.route) await ctx.route(opts.route[0], opts.route[1]);
    await ctx.addInitScript(LIVE_BASE + '\n' + (setup || "window.TERRATERM = { mode: 'live', config: { defaultSite: 'live-site' }, api: window.__live };"));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => consoleErrors.push('[regress ' + (hash || '') + '] pageerror ' + e.message));
    await page.goto(URL0 + (hash || ''));
    await page.waitForFunction(() => window.TT && TT.app && TT.app.quotesAsOf, null, { timeout: 10000 });
    return { ctx, page };
  }

  await check('R-H1', 'Live mode: a missing optional method stays off; nothing synthetic appears', async () => {
    const { ctx, page } = await openLive();
    await page.waitForTimeout(2500);
    await go(page, 'commodities');
    await page.waitForTimeout(300);
    await page.evaluate(() => TT.demo.start());
    const r = await page.evaluate(() => ({ alerts: TT.app.alerts.length, wire: TT.app.wire.length, flow: !!TT.app.flow, sites: TT.app.sites.length, sys: !!TT.app.system, f5: document.querySelector('#view-commodities .fv-head .ps').textContent, debug: !!window.TERRATERM.debug, mode: TT.app.mode, demo: TT.app.demo.on }));
    await ctx.close();
    assert(!r.alerts && !r.wire && !r.flow && !r.sites && !r.sys && !r.debug && r.mode === 'live' && !r.demo, JSON.stringify(r));
    assert(/Not connected/.test(r.f5), 'F5: ' + r.f5);
    return 'no alerts, wire, flow, sites or system data · F5 "' + r.f5 + '"';
  });

  await check('R-H2', 'Live mode: a class-instance backend is used, not the scaffold', async () => {
    const { ctx, page } = await openLive(`class B { constructor(l) { this.l = l; this.calls = 0; } watchlist(o) { this.calls++; return this.l.watchlist(o); } macro(o) { return this.l.macro(o); } imagery(o) { return this.l.imagery(o); } ask(o) { return this.l.ask(o); } }
      window.__b = new B(window.__live); window.TERRATERM = { mode: 'live', config: { defaultSite: 'live-site' }, api: window.__b };`);
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => ({ calls: window.__b.calls, src: TT.app.quotesSource, spx: TT.app.quotes.get('SPX').px }));
    await ctx.close();
    assert(r.calls > 0 && r.src === 'live' && r.spx === 100, JSON.stringify(r));
    return r.calls + ' live calls · SPX ' + r.spx;
  });

  await check('R-H3', 'Macro: KPI cards bind by symbol; a missing KPI shows a dash and the chart still draws', async () => {
    const { ctx, page } = await openLive(`window.TERRATERM = { mode: 'live', config: { defaultSite: 'live-site' }, api: Object.assign({}, window.__live, {
      macro: async (o) => { const r = await window.__live.macro(o); r.kpis = r.kpis.reverse().filter((k) => k.sym !== 'VIX'); r.series = r.series.filter((s) => s.id !== 'VIX'); return r; } }) };`, '#/macro');
    await page.waitForFunction(() => TT.views.macro.chart && TT.views.macro.chart.data, null, { timeout: 8000 });
    const r = await page.evaluate(() => ({ cards: TT.$$('#view-macro .kpi').map((c) => c.querySelector('.k-l').textContent.split(' · ')[1] + '=' + c.querySelector('.k-v').textContent), series: TT.views.macro.chart.data.series.length }));
    await ctx.close();
    assert(r.cards[0] === 'SPX=100.00' && r.cards[4] === 'DXY=104.00' && r.cards[5] === 'VIX=—' && r.series === 5, JSON.stringify(r));
    return r.cards.join(' ');
  });

  await check('R-H4', 'Router: a malformed percent-encoded link still boots', async () => {
    const { ctx, page } = await open('#/orbital/%E0%A4%A');
    const r = await page.evaluate(() => ({ busy: document.getElementById('app').getAttribute('aria-busy'), view: TT.router.current.view }));
    await ctx.close();
    assert(r.busy === 'false', JSON.stringify(r));
    return 'booted on ' + r.view;
  });

  await check('R-M1', 'Orbital: a newer pass announced by sites() appears without a reload; live default site comes from sites()', async () => {
    const { ctx, page } = await openLive(`window.__n = 0; const T0 = Date.now() - 864e5 * 3; const tsOf = (k) => T0 + k * 864e5;
      window.TERRATERM = { mode: 'live', api: Object.assign({}, window.__live, {
        sites: async () => ({ asOf: Date.now(), sites: [{ id: 'tank-a', name: 'Tank A', short: 'TA', type: 't', region: 'r', cls: 'energy', key: 'k', latestPass: tsOf(window.__n), segments: 0, keyLabel: 'k', keyMetric: { name: 'm', value: 1, unit: '' }, keyConf: 0.9 }] }),
        imagery: async ({ site: id, pass }) => { const r = await window.__live.imagery({ site: id }); const n = window.__n; const i = pass == null ? n : Number(pass);
          r.passes = Array.from({ length: n + 1 }, (_, k) => ({ id: 'p' + k, i: k, ts: tsOf(k) })); r.pass = Object.assign(r.pass, { id: 'p' + i, i: i, ts: tsOf(i) }); return r; } }) };`);
    await page.waitForFunction(() => TT.views.desk.viewer.res, null, { timeout: 8000 });
    const site = await page.evaluate(() => TT.views.desk.viewer.site);
    await page.evaluate(() => { window.__n = 1; TT.app.pollers.sites.now(); });
    await page.waitForFunction(() => TT.views.desk.viewer.passes.length === 2, null, { timeout: 5000 });
    await ctx.close();
    assert(site === 'tank-a', 'default site ' + site);
    return 'opened on ' + site + ' · passes 1 → 2';
  });

  await check('R-M2', 'Orbital: RETRY fetches a failed image again', async () => {
    let n = 0;
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const { ctx, page } = await openLive(`window.TERRATERM = { mode: 'live', config: { defaultSite: 'live-site' }, api: Object.assign({}, window.__live, {
      imagery: async (o) => { const r = await window.__live.imagery(o); r.pass.imageUrl = 'https://flaky.test/pass.png'; return r; } }) };`, '', {
      route: ['https://flaky.test/**', (route) => { n++; return n === 1 ? route.fulfill({ status: 503, body: 'down' }) : route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: png }); }] });
    await page.waitForSelector('#panel-macro .orb-loading button', { timeout: 8000 });
    await page.click('#panel-macro .orb-loading button');
    await page.waitForFunction(() => TT.views.desk.viewer.res, null, { timeout: 5000 });
    await ctx.close();
    assert(n === 2, 'image requests ' + n);
    return 'failed once, RETRY refetched, pass drawn';
  });

  await check('R-M4', 'Demo mode: leaves saved pins and chat alone and returns to the live backend', async () => {
    const { ctx, page } = await openLive("window.TERRATERM = { mode: 'live', config: { defaultSite: 'live-site', allowDemo: true }, api: window.__live };");
    await page.evaluate(() => { TT.app.togglePin({ kind: 'symbol', id: 'HG1', label: 'HG1' }); TT.app.chat.push({ id: 'k1', role: 'user', text: 'keep me', ts: 1 }); TT.app.save('chat'); });
    await page.evaluate(() => TT.demo.start());
    await page.waitForTimeout(600);
    const during = await page.evaluate(() => ({ mode: TT.app.mode, pins: TT.store.get('pins', []).length, chat: TT.store.get('chat', []).length, status: document.querySelector('.sb-mode').textContent }));
    await page.evaluate(() => TT.demo.exit());
    await page.waitForFunction(() => TT.app.quotesSource === 'live', null, { timeout: 5000 });
    const after = await page.evaluate(() => ({ mode: TT.app.mode, pins: TT.app.pins.length, chat: TT.app.chat.length, status: document.querySelector('.sb-mode').textContent }));
    await ctx.close();
    assert(during.mode === 'scaffold' && during.status === 'SCAFFOLD' && during.pins === 1 && during.chat === 1, 'during ' + JSON.stringify(during));
    assert(after.mode === 'live' && after.status === 'LIVE' && after.pins === 1 && after.chat === 1, 'after ' + JSON.stringify(after));
    return 'storage kept during demo · back to LIVE with 1 pin and 1 message';
  });

  await check('R-M5', 'Rules: "Agent log only" posts to the agent without a toast', async () => {
    const { ctx, page } = await open('#/alerts');
    await page.evaluate(() => { TT.app.rules = []; TT.$$('.toast').forEach((t) => t.remove()); TT.app.addRule({ sym: 'SPX', metric: 'px', op: '>', threshold: 1, channel: 'agent' }); TT.$$('.toast').forEach((t) => t.remove()); });
    await page.waitForFunction(() => TT.app.chat.some((m) => m.role === 'system' && /RULE/.test(m.text)), null, { timeout: 5000 });
    const toasts = await page.evaluate(() => TT.$$('.toast .msgtxt').map((t) => t.textContent).filter((t) => /ALERT/.test(t)));
    await ctx.close();
    assert(!toasts.length, 'toast shown: ' + toasts.join(' | '));
    return 'agent log entry, no toast';
  });

  await check('R-M6', 'F5/F6: instruments added or dropped by the feed appear and disappear', async () => {
    const { ctx, page } = await openLive(`window.__syms = ['AAA', 'BBB', 'CCC'];
      const row = (s, k) => ({ ord: k, sym: s, name: s + ' future', kind: 'commodity', px: 10 + k, prev: 9 + k, chg: 1, chgPct: 0.1, hi: 11 + k, lo: 9 + k, volume: 100, spark: [1, 2, 3], ts: Date.now() });
      window.TERRATERM = { mode: 'live', config: { defaultSite: 'live-site' }, api: Object.assign({}, window.__live, { quotes: async ({ kind }) => ({ asOf: Date.now(), source: 'live', kind: kind, rows: window.__syms.map(row) }) }) };`, '#/commodities');
    await page.waitForFunction(() => TT.$$('#view-commodities tr.row').length === 3, null, { timeout: 8000 });
    await page.evaluate(() => { window.__syms = ['BBB', 'CCC', 'DDD', 'EEE']; });
    await page.waitForFunction(() => TT.$$('#view-commodities tr.row').map((r) => r.dataset.sym).join(',') === 'BBB,CCC,DDD,EEE', null, { timeout: 6000 });
    await ctx.close();
    return 'AAA,BBB,CCC → BBB,CCC,DDD,EEE';
  });

  await check('R-M7', 'F5: an unknown symbol in the link stops waiting and says so', async () => {
    const { ctx, page } = await open('#/commodities/NOPE');
    await page.waitForFunction(() => TT.$$('.toast .msgtxt').some((t) => /No instrument NOPE/.test(t.textContent)), null, { timeout: 12000 });
    await page.evaluate(() => { window.__t = 0; const o = window.setTimeout; window.setTimeout = function (f, ms) { if (ms === 150) window.__t++; return o.apply(this, arguments); }; });
    await page.waitForTimeout(800);
    const t = await page.evaluate(() => window.__t);
    await ctx.close();
    assert(t === 0, 'still polling: ' + t);
    return 'toast shown, polling stopped';
  });

  await check('R-L1', 'Wire: only http(s) source links are rendered', async () => {
    const { ctx, page } = await openLive(`window.TERRATERM = { mode: 'live', config: { defaultSite: 'live-site' }, api: Object.assign({}, window.__live, { wire: async () => ({ asOf: Date.now(), source: 'live', items: [
      { id: 'a', ts: Date.now(), tag: 'macro', head: 'BAD LINK', sum: 's', src: 'X', url: 'javascript:alert(1)' }, { id: 'b', ts: Date.now() - 1, tag: 'macro', head: 'GOOD LINK', sum: 's', src: 'Y', url: 'https://example.com/x' }] }) }) };`);
    await page.waitForFunction(() => TT.$$('#panel-watch .wire-item').length === 2, null, { timeout: 6000 });
    await page.click('#panel-watch .wire-item:nth-child(1) > button');
    await page.click('#panel-watch .wire-item:nth-child(2) > button');
    const hrefs = await page.evaluate(() => TT.$$('#panel-watch .wire-more a').map((a) => a.getAttribute('href')));
    await ctx.close();
    assert(hrefs.length === 1 && hrefs[0] === 'https://example.com/x', JSON.stringify(hrefs));
    return 'javascript: dropped · https kept';
  });

  await check('R-L2', 'Agent: RETRY replaces only the failed answer and its prompt', async () => {
    const { ctx, page } = await open('#/agent');
    const r = await page.evaluate(async () => {
      TT.app.chat = [{ id: 'a0', role: 'agent', text: '', error: 'The agent did not respond.', prompt: 'old question', ts: 1 }, { id: 'u1', role: 'user', text: 'newest user msg', ts: 2 }, { id: 's1', role: 'system', text: 'NEWEST SYSTEM MSG', ts: 3 }];
      TT.app.retryAsk('a0');
      await new Promise((res) => { const t = setInterval(() => { if (!TT.app.asking) { clearInterval(t); res(); } }, 50); });
      return TT.app.chat.map((m) => m.role + ':' + (m.text || '').slice(0, 20));
    });
    await ctx.close();
    assert(r.indexOf('system:NEWEST SYSTEM MSG') >= 0 && r.indexOf('user:newest user msg') >= 0 && !r.some((x) => x === 'agent:'), JSON.stringify(r));
    return r.length + ' messages, newest kept';
  });

  await check('R-L3', 'Optional feeds: a failing wire or events feed marks its own panel stale; the main feed stays live', async () => {
    const { ctx, page } = await openLive(`window.TERRATERM = { mode: 'live', config: { defaultSite: 'live-site' }, api: Object.assign({}, window.__live, {
      wire: async () => { throw new Error('wire down'); }, events: async () => { throw new Error('events down'); } }) };`);
    await page.waitForFunction(() => TT.app.down.wire && TT.app.down.events, null, { timeout: 6000 });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => ({ feed: TT.app.feed.status, wire: document.querySelector('#panel-watch .list').textContent, tl: !document.querySelector('#panel-timeline .ribbon').hidden, tlText: document.querySelector('#panel-timeline .ribbon').textContent }));
    await ctx.close();
    assert(r.feed === 'live' && /Wire unavailable/.test(r.wire) && r.tl, JSON.stringify(r));
    return 'feed live · wire "unavailable" · timeline ' + r.tlText;
  });

  await check('R-L5', 'Macro: physical-signal labels never overlap', async () => {
    const { ctx, page } = await open('#/macro');
    await page.waitForFunction(() => TT.views.macro.chart && TT.views.macro.chart.markerPos && TT.views.macro.chart.markerPos.length > 1, null, { timeout: 8000 });
    await page.waitForTimeout(700);
    const r = await page.evaluate(() => { const b = TT.views.macro.chart.markerPos.map((p) => p.box); let hits = 0; for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) { const [x, y, w, h] = b[i], [X, Y, W, H] = b[j]; if (x < X + W && x + w > X && y < Y + H && y + h > Y) hits++; } return { n: b.length, hits: hits }; });
    await ctx.close();
    assert(r.hits === 0, r.hits + ' overlapping labels');
    return r.n + ' labels, 0 overlaps';
  });

  await check('R-L5b', 'Orbital: the segment drawer leaves the segment list visible', async () => {
    const { ctx, page } = await open('#/orbital/ela-segundo-tanks/grp-b');
    await page.waitForSelector('.drawer.open');
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => { const d = document.querySelector('.drawer').getBoundingClientRect(); const s = document.querySelector('#view-orbital .orb-right').getBoundingClientRect(); const name = document.querySelector('#view-orbital .orb-right tr.row td.trunc'); return { drawerLeft: Math.round(d.left), listRight: Math.round(s.right), listWidth: Math.round(s.width), nameWidth: name ? Math.round(name.getBoundingClientRect().width) : 0, nameText: name ? name.textContent : '' }; });
    await ctx.close();
    assert(r.listRight <= r.drawerLeft + 1 && r.listWidth >= 280 && r.nameWidth >= 100, JSON.stringify(r));
    return 'list ' + r.listWidth + ' px, segment names ' + r.nameWidth + ' px, clear of the drawer';
  });

  await check('R-L7', 'Market clock: NYSE holidays and early closes', async () => {
    const { ctx, page } = await open();
    const r = await page.evaluate(() => [Date.UTC(2026, 11, 25, 15), Date.UTC(2026, 11, 24, 17), Date.UTC(2026, 11, 24, 18, 30), Date.UTC(2026, 9, 26, 15)].map((t) => TT.marketState(t).label));
    await ctx.close();
    assert(r.join('|') === 'HOLIDAY|OPEN · EARLY CLOSE|CLOSED|OPEN', r.join('|'));
    return 'Dec 25 ' + r[0] + ' · Dec 24 noon ' + r[1] + ' · Dec 24 1:30 pm ' + r[2] + ' · Oct 26 ' + r[3];
  });

  await check('R-L8', 'Privacy: turning off conversation saving deletes the stored copy and stops saving', async () => {
    const { ctx, page } = await open();
    const r = await page.evaluate(async () => {
      TT.app.chat.push({ id: 'p1', role: 'user', text: 'private', ts: 1 }); TT.app.save('chat');
      const before = TT.store.get('chat', []).length;
      TT.app.setSaveChat(false);
      await TT.app.ask('Brief me');
      return { before: before, after: TT.store.get('chat', null), pref: TT.store.get('prefs', {}).saveChat };
    });
    await ctx.close();
    assert(r.before === 1 && r.after === null && r.pref === false, JSON.stringify(r));
    return 'stored copy deleted, nothing saved after';
  });


  /* Live label sweep: with a live backend attached, no view, drawer, palette or sheet shows demo wording. */
  const BANNED = /\b(demo|mock|scaffold|synthetic|fake|placeholder)\b|spark 1\.3|sam 3\.1|glimmer|apex studio|sat vhr|ela-segundo|san-pedro|el segundo|san pedro|cushing|barstow|ontario retail|gary/i;
  async function sweepLive(page) {
    const found = [];
    const grab = async (where) => {
      const hits = await page.evaluate((src) => {
        const re = new RegExp(src, 'i');
        const out = [];
        const seen = (t, how) => { if (t && re.test(t)) out.push(how + ': ' + t.trim().replace(/\s+/g, ' ').slice(0, 90)); };
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) { const n = walker.currentNode; const el = n.parentElement; if (!el || el.closest('[hidden], script, style')) continue; if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed' && !el.closest('.sr-only')) continue; seen(n.textContent, 'text'); }
        document.querySelectorAll('[aria-label], [data-tip], [placeholder], [title], [data-src]').forEach((el) => { if (el.closest('[hidden]')) return; ['aria-label', 'data-tip', 'placeholder', 'title', 'data-src'].forEach((a) => seen(el.getAttribute(a), a)); });
        seen(document.title, 'title');
        return out;
      }, BANNED.source);
      hits.forEach((h) => found.push(where + ' · ' + h));
    };
    for (const v of ['desk', 'macro', 'orbital', 'agent', 'flow', 'commodities', 'fx', 'intel', 'alerts']) {
      await go(page, v); await page.waitForTimeout(v === 'commodities' || v === 'fx' ? 2600 : 900); await grab(v);
    }
    await go(page, 'commodities'); await page.waitForTimeout(400);
    const row = await page.$('#view-commodities tr.row'); if (row) { await row.click(); await page.waitForTimeout(600); await grab('symbol drawer'); }
    await go(page, 'orbital'); await page.waitForTimeout(600);
    await page.evaluate(() => { const v = TT.views.orbital.viewer; if (v.segments[0]) v.select(v.segments[0].id); });
    await page.waitForTimeout(500); await grab('segment drawer');
    await page.evaluate(() => TT.ui.closeDrawer());
    await page.evaluate(() => TT.app.ask('Brief me')); await page.waitForFunction(() => !TT.app.asking); await go(page, 'agent'); await page.waitForTimeout(300); await grab('agent answer');
    await page.evaluate(() => TT.palette.open()); await page.waitForTimeout(200); await grab('palette (empty)');
    for (const q of ['demo', 'scaffold', 'mock']) { await page.evaluate((t) => TT.palette.type(t), q); await page.waitForTimeout(150); await grab('palette "' + q + '"'); }
    await page.evaluate(() => TT.palette.close()); await page.evaluate(() => TT.shortcuts()); await page.waitForTimeout(200); await grab('shortcut sheet');
    await page.evaluate(() => TT.ui.closeTop());
    return found.filter((f) => !/palette "\w+" · text: Ask TERRATERM: (demo|scaffold|mock)$/.test(f)); // echo of what was typed
  }
  await check('R-LIVE-a', 'Live label sweep (required methods only): no demo, mock or scaffold wording anywhere', async () => {
    const { ctx, page } = await openLive();
    await page.waitForTimeout(1500);
    const found = await sweepLive(page);
    await ctx.close();
    assert(!found.length, found.length + ' hits: ' + found.slice(0, 6).join(' | '));
    return '9 views, 2 drawers, agent answer, palette, shortcut sheet: clean';
  });
  await check('R-LIVE-b', 'Live label sweep (every optional method too): no demo, mock or scaffold wording anywhere', async () => {
    const { ctx, page } = await openLive(`
      const site2 = (id, name) => ({ id: id, name: name, short: name.slice(0, 4).toUpperCase(), type: 'Terminal', region: 'Rotterdam, NL', cls: 'energy', key: 'k1', latestPass: Date.now() - 36e5, segments: 1, keyLabel: 'NORTH TANKS', keyMetric: { name: 'Fill', value: 61, unit: '%', delta: -2, deltaUnit: 'pp' }, keyConf: 0.91, keySeries: [{ t: Date.now() - 864e5, v: 63 }, { t: Date.now(), v: 61 }] });
      const rows = (kind) => Array.from({ length: 12 }, (_, k) => ({ ord: k, sym: (kind === 'fx' ? 'EURUSD' : 'BRN') + k, name: (kind === 'fx' ? 'Euro / US Dollar ' : 'Brent month ') + k, kind: kind === 'fx' ? 'fx' : 'commodity', px: 80 + k, prev: 79 + k, chg: 1, chgPct: 0.012, hi: 81 + k, lo: 78 + k, volume: 1000, spark: [1, 2, 3, 2], ts: Date.now() }));
      window.TERRATERM = { mode: 'live', config: { org: 'NORTHWIND CAPITAL', defaultSite: 'rtm-1' }, api: Object.assign({}, window.__live, {
        imagery: async ({ site: id }) => { const r = await window.__live.imagery({ site: id }); r.site = site2(id, 'Rotterdam Europoort'); r.pass.model = 'SegNet 4'; r.pass.sensor = 'WV-3'; r.pass.segments = [{ id: 'k1', label: 'NORTH TANKS', cls: 'energy', hud: true, conf: 0.91, geom: { t: 'circle', cx: 0.5, cy: 0.5, r: 0.1 }, area_m2: 5000, metric: { name: 'Fill', value: 61, unit: '%', prior: 63, delta: -2, deltaUnit: 'pp' }, rule: 'Shadow-ratio fill estimate.' }]; return r; },
        sites: async () => ({ asOf: Date.now(), sites: [site2('rtm-1', 'Rotterdam Europoort')] }),
        quotes: async ({ kind }) => ({ asOf: Date.now(), source: 'Northwind feed', kind: kind, rows: rows(kind) }),
        series: async ({ sym }) => ({ asOf: Date.now(), sym: sym, name: sym, kind: 'commodity', points: [[Date.now() - 864e5, 80], [Date.now(), 81]] }),
        flow: async () => ({ asOf: Date.now(), source: 'Northwind flows', unit: 'USD mm', categories: ['Energy', 'Rates'], t: [Date.now() - 36e5, Date.now()], series: { Energy: [10, 12], Rates: [5, 6] } }),
        wire: async () => ({ asOf: Date.now(), source: 'Northwind wire', items: [{ id: 'n1', ts: Date.now(), tag: 'geo', head: 'Rotterdam tanks draw', sum: 'North group fill down 2 pp.', src: 'Northwind', site: 'rtm-1', syms: ['CL1'] }] }),
        events: async () => ({ asOf: Date.now(), events: [{ seq: 1, ts: Date.now(), type: 'alert', id: 'a1', sev: 'med', subject: 'Rotterdam · NORTH TANKS', message: 'Fill −2 pp', conf: 0.91, site: 'rtm-1', route: 'orbital/rtm-1/k1' }] }),
        system: async () => ({ asOf: Date.now(), mode: 'live', models: [{ name: 'SegNet 4', role: 'segmentation', where: 'cloud', status: 'ok', latencyMs: 120 }, { name: 'Analyst 2', role: 'reasoning', where: 'cloud', status: 'ok', latencyMs: 300 }], context: { used: 1000, max: 200000 }, sourcesFused: 4 }),
      }) };`);
    await page.waitForFunction(() => TT.app.system && TT.app.sites.length, null, { timeout: 8000 });
    const found = await sweepLive(page);
    const names = await page.evaluate(() => ({ agent: document.querySelector('#panel-agent .ph .ps').textContent, org: (document.querySelector('.org') || {}).textContent }));
    await ctx.close();
    assert(!found.length, found.length + ' hits: ' + found.slice(0, 6).join(' | '));
    assert(/Analyst 2/.test(names.agent) && names.org === 'NORTHWIND CAPITAL', 'labels from backend/config: ' + JSON.stringify(names));
    return 'clean · agent panel "' + names.agent + '" · org ' + names.org;
  });


  await check('R-SCALE', 'Scale: a 2,000-instrument feed updates in under 100 ms and off-screen rows paint when scrolled to', async () => {
    const { ctx, page } = await openLive(`
      const base = Array.from({ length: 2000 }, (_, k) => ({ ord: k, sym: 'S' + k, name: 'Instrument ' + k, kind: 'commodity', px: 50 + (k % 90), prev: 50 + (k % 90) }));
      window.TERRATERM = { mode: 'live', config: { defaultSite: 'live-site' }, api: Object.assign({}, window.__live, { quotes: async ({ kind }) => ({ asOf: Date.now(), source: 'live', kind: kind,
        rows: base.map((r) => { r.px = +(r.px * (1 + (Math.random() - 0.5) * 0.002)).toFixed(2); return { ord: r.ord, sym: r.sym, name: r.name, kind: r.kind, px: r.px, prev: r.prev, chg: r.px - r.prev, chgPct: r.px / r.prev - 1, hi: r.px + 1, lo: r.px - 1, volume: 1000, spark: [1, 3, 2, 4], ts: Date.now() }; }) }) }) };`, '#/commodities');
    await page.waitForFunction(() => TT.$$('#view-commodities tr.row').length === 2000, null, { timeout: 20000 });
    await page.evaluate(() => { const v = TT.views.commodities; const o = v.update.bind(v); window.__u = []; v.update = function (r) { const t = performance.now(); o(r); window.__u.push(performance.now() - t); }; });
    await page.waitForTimeout(6500);
    const u = await page.evaluate(() => window.__u);
    await page.evaluate(() => { const w = TT.views.commodities.wrap; w.scrollTop = w.scrollHeight; });
    await page.waitForTimeout(400);
    const last = await page.evaluate(() => { const rows = TT.$$('#view-commodities tr.row'); const tr = rows[rows.length - 1]; return { sym: tr.dataset.sym, px: tr.children[3].textContent, want: TT.views.commodities.data.get(tr.dataset.sym).px }; });
    await ctx.close();
    const worst = Math.max.apply(null, u);
    assert(u.length >= 2 && worst < 100, 'update ms ' + u.map((x) => x.toFixed(0)).join(','));
    assert(last.px && Number(last.px.replace(/,/g, '')) === last.want, 'last row ' + JSON.stringify(last));
    return u.length + ' updates, worst ' + worst.toFixed(0) + ' ms · ' + last.sym + ' painted on scroll';
  });

  await check('99', 'No console errors across the whole run', async () => {
    assert(!consoleErrors.length, consoleErrors.slice(0, 4).join(' | '));
    return 'clean';
  });

  await browser.close();
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  mkdirSync(join(root, 'test', 'out'), { recursive: true });
  writeFileSync(join(root, 'test', 'out', 'report.json'), JSON.stringify({ when: new Date().toISOString(), passed: passed, total: results.length, results: results }, null, 2));
  const md = ['# TERRATERM acceptance report', '', `${new Date().toISOString()} \u00b7 ${passed}/${results.length} checks passed \u00b7 Chromium ${chromeVersion}`, '', '| Id | Check | Result | Detail |', '|---|---|---|---|']
    .concat(results.map((r) => `| ${r.id} | ${r.name.replace(/\|/g, '/')} | ${r.ok ? 'PASS' : 'FAIL'} | ${String(r.detail).replace(/\|/g, '/')} |`)).join('\n') + '\n';
  writeFileSync(join(root, 'test', 'out', 'report.md'), md);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async (e) => { console.error(e); if (browser) await browser.close(); process.exit(2); });
