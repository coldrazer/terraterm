/* Scaffold reference data. Every value here is synthetic and used only when no live backend is wired. */
(function () {
  'use strict';
  const TT = window.TT;
  TT.mock = TT.mock || {};

  // Instruments for the watchlist and macro dashboard. px = last, prev = prior settle.
  const instruments = [
    { sym: 'SPX', name: 'S&P 500', kind: 'index', px: 6712.40, prev: 6684.31, vol: 0.15 },
    { sym: 'NDX', name: 'Nasdaq 100', kind: 'index', px: 24580.12, prev: 24442.90, vol: 0.19 },
    { sym: 'RTY', name: 'Russell 2000', kind: 'index', px: 2401.55, prev: 2408.10, vol: 0.21 },
    { sym: 'CL1', name: 'WTI Crude front month', kind: 'commodity', px: 78.42, prev: 76.65, vol: 0.34 },
    { sym: 'CO1', name: 'Brent Crude front month', kind: 'commodity', px: 82.10, prev: 80.61, vol: 0.31 },
    { sym: 'NG1', name: 'Henry Hub Natural Gas', kind: 'commodity', px: 3.41, prev: 3.46, vol: 0.55 },
    { sym: 'HG1', name: 'Copper (COMEX) $/lb', kind: 'metal', px: 4.87, prev: 4.83, vol: 0.24 },
    { sym: 'GC1', name: 'Gold (COMEX) $/oz', kind: 'metal', px: 4120.50, prev: 4131.20, vol: 0.16 },
    { sym: 'US10Y', name: 'US Treasury 10Y yield %', kind: 'yield', px: 4.215, prev: 4.183, vol: 0.09 },
    { sym: 'US2Y', name: 'US Treasury 2Y yield %', kind: 'yield', px: 3.842, prev: 3.851, vol: 0.10 },
    { sym: 'DXY', name: 'US Dollar Index', kind: 'index', px: 101.84, prev: 101.62, vol: 0.07 },
    { sym: 'VIX', name: 'CBOE Volatility Index', kind: 'vol', px: 15.42, prev: 15.88, vol: 0.85 },
    { sym: 'EURUSD', name: 'Euro / US Dollar', kind: 'fx', px: 1.1612, prev: 1.1634, vol: 0.07 },
    { sym: 'USDJPY', name: 'US Dollar / Japanese Yen', kind: 'fx', px: 148.2210, prev: 147.8840, vol: 0.09 },
  ];
  // CL1 day change is pinned at +2.31% by prev: 78.42 / 76.65 - 1 = 2.309%.

  const kpiMap = [
    { slot: 'Index', sym: 'SPX' },
    { slot: 'Commodity', sym: 'CL1' },
    { slot: 'Metal', sym: 'HG1' },
    { slot: 'Yield', sym: 'US10Y' },
    { slot: 'Dollar', sym: 'DXY' },
    { slot: 'Vol', sym: 'VIX' },
  ];

  // 25 futures products x 8 contract months = 200 rows (§8.6 acceptance).
  const products = [
    ['CL', 'WTI Crude', 78.42, 0.34, -0.35, 'CL1'], ['CO', 'Brent Crude', 82.10, 0.31, -0.30, 'CO1'], ['HO', 'Heating Oil', 2.62, 0.30, -0.006, null],
    ['XB', 'RBOB Gasoline', 2.31, 0.33, -0.012, null], ['NG', 'Henry Hub Gas', 3.41, 0.55, 0.09, 'NG1'], ['QS', 'Gasoil', 742.25, 0.29, -2.5, null],
    ['HG', 'Copper', 4.87, 0.24, 0.012, 'HG1'], ['GC', 'Gold', 4120.50, 0.16, 14.2, 'GC1'], ['SI', 'Silver', 48.62, 0.28, 0.21, null],
    ['PL', 'Platinum', 1384.20, 0.27, 4.1, null], ['PA', 'Palladium', 1102.40, 0.33, 2.2, null], ['ALI', 'Aluminum', 2611.50, 0.20, 9.5, null],
    ['ZNC', 'Zinc', 2904.00, 0.22, 6.0, null], ['NIC', 'Nickel', 15880.00, 0.26, 41.0, null], ['ZC', 'Corn', 4.41, 0.22, 0.05, null],
    ['ZS', 'Soybeans', 10.72, 0.18, 0.07, null], ['ZW', 'Wheat', 5.38, 0.27, 0.06, null], ['KC', 'Coffee', 3.86, 0.36, -0.03, null],
    ['SB', 'Sugar No.11', 0.162, 0.30, 0.001, null], ['CC', 'Cocoa', 6420.00, 0.45, -48.0, null], ['CT', 'Cotton', 0.672, 0.21, 0.004, null],
    ['LE', 'Live Cattle', 2.31, 0.14, -0.006, null], ['HE', 'Lean Hogs', 0.892, 0.24, 0.011, null], ['OJ', 'Orange Juice', 2.48, 0.52, -0.04, null],
    ['LBR', 'Lumber', 612.50, 0.32, 3.8, null],
  ];
  const monthCodes = 'FGHJKMNQUVXZ';
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const currencies = [
    ['USD', 1], ['EUR', 0.8612], ['JPY', 148.221], ['GBP', 0.7518], ['CHF', 0.8024], ['AUD', 1.5302], ['CAD', 1.3851], ['NZD', 1.7104],
    ['SEK', 9.4512], ['NOK', 10.0533], ['DKK', 6.4302], ['SGD', 1.2912], ['HKD', 7.7811], ['CNH', 7.1204], ['KRW', 1385.20], ['INR', 87.912],
    ['MXN', 18.402], ['BRL', 5.4221], ['ZAR', 17.613], ['TRY', 41.802], ['PLN', 3.6604], ['HUF', 335.12], ['CZK', 21.004], ['ILS', 3.3412],
    ['THB', 32.402], ['TWD', 30.211], ['IDR', 16450.0], ['PHP', 57.812], ['CLP', 940.20], ['COP', 3950.1],
  ];

  // Physical sites. Ids are URL addressable (§7): #/orbital/<id>
  const sites = [
    { id: 'ela-segundo-tanks', name: 'El Segundo Tank Farm', short: 'EL SEGUNDO', type: 'Tank farm', region: 'Los Angeles, CA', cls: 'energy', gsd: 0.5, cadenceH: 24, latestAgoMin: 38, linked: ['CL1', 'CO1'] },
    { id: 'san-pedro-port', name: 'San Pedro Bay Container Port', short: 'SAN PEDRO BAY', type: 'Port', region: 'Long Beach, CA', cls: 'maritime', gsd: 1.5, cadenceH: 168, latestAgoMin: 131, linked: ['SPX', 'RTY'] },
    { id: 'cushing-hub', name: 'Cushing Storage Hub', short: 'CUSHING', type: 'Tank farm', region: 'Cushing, OK', cls: 'energy', gsd: 0.6, cadenceH: 24, latestAgoMin: 184, linked: ['CL1'] },
    { id: 'barstow-rail', name: 'Barstow Rail Yard', short: 'BARSTOW', type: 'Rail yard', region: 'Barstow, CA', cls: 'logistics', gsd: 0.6, cadenceH: 24, latestAgoMin: 297, linked: ['SPX'] },
    { id: 'ontario-retail', name: 'Ontario Retail Lot', short: 'ONTARIO', type: 'Retail lot', region: 'Ontario, CA', cls: 'logistics', gsd: 0.3, cadenceH: 24, latestAgoMin: 352, linked: ['RTY'] },
    { id: 'gary-works', name: 'Gary Industrial Complex', short: 'GARY', type: 'Steel works', region: 'Gary, IN', cls: 'industrial', gsd: 0.6, cadenceH: 72, latestAgoMin: 541, linked: ['HG1'] },
  ];

  // Wire templates. mins = minutes before boot. Tag: macro | geo | alert.
  const wire = [
    { mins: 2, tag: 'alert', head: 'El Segundo group B tank fill falls 11.4 pp in one pass', sum: 'SAM 3.1 flags a single-pass drawdown across 6 floating-roof tanks. Other groups at the site are flat.', site: 'ela-segundo-tanks', syms: ['CL1'], src: 'SAM 3.1 detector' },
    { mins: 6, tag: 'macro', head: 'WTI extends gains, front month up more than 2%', sum: 'Front-month crude trades above 78 for the first time this week. Brent follows with a smaller move.', syms: ['CL1', 'CO1'], src: 'scaffold wire' },
    { mins: 11, tag: 'geo', head: 'San Pedro Bay anchorage count at a six-pass high', sum: 'Vessels waiting outside the breakwater rose for a fifth straight weekly pass. Yard utilization also climbed.', site: 'san-pedro-port', syms: ['SPX'], src: 'SAM 3.1 detector' },
    { mins: 17, tag: 'macro', head: 'Treasury 10Y yield up 3 bp into the auction window', sum: 'The curve bear-steepens modestly. The 2Y is little changed on the session.', syms: ['US10Y', 'US2Y'], src: 'scaffold wire' },
    { mins: 24, tag: 'geo', head: 'Cushing tanks show a third straight daily build', sum: 'Aggregate roof-shadow fill rose 2.2 pp across 12 monitored tanks. East group leads the build.', site: 'cushing-hub', syms: ['CL1'], src: 'SAM 3.1 detector' },
    { mins: 31, tag: 'macro', head: 'Copper firms as dollar index holds near 101.8', sum: 'Base metals trade steady. COMEX copper holds a narrow range above 4.80.', syms: ['HG1', 'DXY'], src: 'scaffold wire' },
    { mins: 38, tag: 'geo', head: 'Gary iron ore stockpile shrinks for a sixth pass', sum: 'Estimated pile volume is down 15% over six passes. One ore carrier is berthed at the dock.', site: 'gary-works', syms: ['HG1'], src: 'SAM 3.1 detector' },
    { mins: 46, tag: 'macro', head: 'Volatility index drifts lower as equities grind up', sum: 'VIX trades near 15.4. Realized volatility on the index is running below implied.', syms: ['VIX', 'SPX'], src: 'scaffold wire' },
    { mins: 55, tag: 'geo', head: 'Barstow classification yard railcar count rises', sum: 'Railcars on the 14 classification tracks rose 3% versus the prior pass. Dwell looks elevated.', site: 'barstow-rail', syms: ['SPX'], src: 'SAM 3.1 detector' },
    { mins: 63, tag: 'macro', head: 'Dollar steady against the yen near 148', sum: 'USD/JPY holds its range. Euro softens slightly against the dollar.', syms: ['USDJPY', 'EURUSD'], src: 'scaffold wire' },
    { mins: 74, tag: 'geo', head: 'Ontario retail lot occupancy eases from weekend peak', sum: 'Parking occupancy fell to 66% from 72% on the prior pass. Dock activity is unchanged.', site: 'ontario-retail', syms: ['RTY'], src: 'SAM 3.1 detector' },
    { mins: 86, tag: 'macro', head: 'Natural gas slips as storage expectations rise', sum: 'Front-month Henry Hub trades lower on the day. Weather models shift warmer.', syms: ['NG1'], src: 'scaffold wire' },
    { mins: 97, tag: 'macro', head: 'Gold eases from record territory', sum: 'Bullion trades below the prior settle as real yields tick up.', syms: ['GC1', 'US10Y'], src: 'scaffold wire' },
    { mins: 112, tag: 'geo', head: 'San Pedro Bay gate queue lengthens to 22 trucks', sum: 'The truck queue at the terminal gate grew by five versus the prior pass.', site: 'san-pedro-port', syms: ['SPX'], src: 'SAM 3.1 detector' },
  ];
  // Items released over time while the terminal is open.
  const wireLater = [
    { tag: 'macro', head: 'Brent spread to WTI narrows on the session', sum: 'The Brent premium tightens as WTI outperforms on the day.', syms: ['CO1', 'CL1'], src: 'scaffold wire' },
    { tag: 'geo', head: 'El Segundo group A tanks unchanged on the latest pass', sum: 'Group A fill is within 0.5 pp of the prior pass. The drawdown is confined to group B.', site: 'ela-segundo-tanks', syms: ['CL1'], src: 'SAM 3.1 detector' },
    { tag: 'macro', head: 'Equity index futures hold gains into the close', sum: 'Index futures trade near session highs with light volume.', syms: ['SPX', 'NDX'], src: 'scaffold wire' },
    { tag: 'geo', head: 'Gary dock: ore carrier unloading continues', sum: 'The berthed carrier sits lower in the water than on the prior pass, consistent with unloading still under way.', site: 'gary-works', syms: ['HG1'], src: 'SAM 3.1 detector' },
    { tag: 'macro', head: 'Two-year yield edges lower, curve steepens', sum: 'Front-end yields slip while the 10Y holds its gain.', syms: ['US2Y', 'US10Y'], src: 'scaffold wire' },
    { tag: 'geo', head: 'Cushing west group fill steady', sum: 'West group fill is flat versus the prior pass while east keeps building.', site: 'cushing-hub', syms: ['CL1'], src: 'SAM 3.1 detector' },
  ];

  /* Prompts and segment questions that only make sense for the scaffold dataset. */
  TT.mock.agentPrompts = ['Brief me', 'What is diverging from vol?', 'Explain the tank drawdown', 'Explain the port congestion', 'What is pinned?', 'How is copper?'];
  TT.mock.home = { site: 'ela-segundo-tanks', seg: 'grp-b', pass: 5, prompt: 'Explain the tank drawdown' }; // where the scaffold and its demo start
  TT.mock.segmentPrompt = function (siteId, segId) {
    if (siteId === 'ela-segundo-tanks' && segId === 'grp-b') return 'Explain the tank drawdown';
    if (siteId === 'san-pedro-port' && segId === 'anchorage') return 'Explain the port congestion';
    return null;
  };
  TT.mock.data = {
    instruments: instruments,
    defaultWatchlist: instruments.map((i) => i.sym),
    kpiMap: kpiMap,
    products: products,
    monthCodes: monthCodes,
    monthNames: monthNames,
    currencies: currencies,
    sites: sites,
    wire: wire,
    wireLater: wireLater,
    flowCats: ['Equities', 'Energy', 'Metals', 'Rates', 'FX'],
  };
})();
