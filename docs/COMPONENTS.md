# Component notes per screen

Each screen lists its components, the data it reads, and the acceptance line it is tested against (`test/acceptance.mjs`, check id in brackets).

## Frame (§4)
- **Top bar** 40 px: brand mark (returns to Desk), org, DEMO badge, NYSE OPEN/CLOSED (amber pulse when open, computed in America/New_York), model health with latency, UTC clock. Amber rule beneath.
- **Function bar** 32 px: ⌂ Desk, F1–F8. Active tab is solid amber. Alerts tab shows the active count.
- **Ticker tape** 22 px, off by default, `T` toggles (§19.5). Pauses on hover; static under reduced motion.
- **Status bar** 28 px: feed health (click to retry when down), models, context meter, alert count (click opens F8), demo timer, command hints, mode, version.
- **Responsive**: under 1100 px the bottom row hides and the desk is two columns with the agent below; under 800 px panels stack and the agent is view only [4].

## Desk (§8.1) [8.1a–d]
| Panel | Components | Data |
|---|---|---|
| Watchlist + Wire | grid table (sym, 4h sparkline, last, change with ▲▼), row flash 400 ms, wire list with tag and symbol filters | `watchlist`, `wire` |
| Macro + Orbital | 6 KPI cells, compact orbital viewer with site/pass controls, play and compare | `watchlist`, `imagery` |
| Agent | context chips, chat log, suggested prompts, composer | `ask` |
| Capital flow | stacked area, ABS/SHARE | `flow` |
| Event timeline | alerts, passes, macro prints, agent answers, acknowledgements | `events` |
| System | model health, context meter (amber > 70 %, red > 90 %), sources fused, feed, backend mode, wiring hint | `system` |

Layout: drag the gutters or focus a gutter and use arrow keys; drag a panel header or `Alt+Shift+Arrow` to move a panel; saved per browser [17].

## F1 Macro (§8.2) [8.2a–b]
KPI grid with deltas over the selected window, rebased cross-asset chart with end labels and crosshair readout, series toggles, timeframe 1D/1W/1M/1Y, PHYSICAL SIGNALS overlay. Markers open a popover with the detection rule and the six-pass raw series, and link to Orbital.

## F2 Orbital (§8.3, §11) [8.3a–e]
Imagery canvas (contain fit, never cropped), HUD (site, sensor, GSD, pass time and age, model build), HUD labels for headline segments (pushed clear of the HUD), segment outlines by class, legend with per-class counts (click isolates), minimum confidence stepper (default 0.80), compare slider aligned to the image, pass selector, `[` `]`, PLAY loop over 6 passes, filmstrip, and a segment table that doubles as the text alternative. Selecting a segment opens the drawer: confidence, area, metric, change vs prior, extra estimate, prior and current crops, detection rule, provenance, ASK AGENT, COMPARE, PIN TO CONTEXT.

## F3 Agent (§8.4, §10) [8.4a–c]
Full-height chat with suggested prompts, selected segment, model list and answer policy. Answers stream after a "Reasoning…" state; each ends with clickable sources, a two-decimal confidence and, when relevant, what is missing. Esc stops an answer. Replies are announced through a polite live region.

## F4 Capital flow (§8.5) [8.5]
Stacked area over 72 hourly points, ABS/SHARE toggle without reload, crosshair readout with every category and the total, summary table (last hour, 24 h, 72 h, share).

## F5 Commodities, F6 FX (§8.6) [8.6a–c]
200 rows each, sticky header, sortable columns (aria-sort), filter box, 1D sparklines, cell flash on update, PIN to watchlist (synced with the desk), `P` pins the focused row, Enter opens the chart drawer (24 h at 15-minute bars, PIN, ADD TO CONTEXT, ASK AGENT).

## F7 Satellite intel (§8.7) [8.7]
Site table (type, region, latest pass, age, segment count, active alerts, key signal, cadence) and site cards with the latest pass thumbnail and a six-pass trend of the key signal. Any row or card opens Orbital on that site.

## F8 Alerts (§8.8) [8.8a–b]
Inbox with ACTIVE / ALL / ACKNOWLEDGED, severity tags with text, subject links to the source, confidence, age, ACKNOWLEDGE and ACKNOWLEDGE ALL. Rules builder: symbol, change % or last, above/below, threshold, channel (toast, agent log or both). Rules re-arm when the condition clears.

## Overlays (§6, §7)
- **Command palette** `/`: views, sites, segments, symbols, actions, and "Ask TERRATERM: …". Arrows, Enter, Esc, and 1–8 with an empty query [7c].
- **Shortcut sheet** `?` [7d].
- **Toasts**: bottom center, amber border, 2.6 s, confirmations and new alerts only. Errors stay inline with RETRY [8.8a, 13a].
- **Tooltips**: full value plus source for any truncated text.

## States (§13) [13a–d]
Skeleton rows (≥ 400 ms), blurred imagery placeholder with "Loading pass…", "Reasoning…" bubble, chart series fade in after axes, stale ribbons when the feed drops or data is older than 15 minutes, blueprint empty-state copy.
