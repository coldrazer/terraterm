# TERRATERM backend contract

The UI talks to one object: `window.TERRATERM.api`. Define it in a script placed before the app scripts (or before the inlined bundle in `dist/terraterm.html`). If it is missing, or lacks a required method, the scaffold backend runs instead and the status bar and System panel say SCAFFOLD.

`api` can be a plain object or a class instance; methods are called with `this` bound to it.

```html
<script>
  window.TERRATERM = {
    mode: 'live',                                   // shown in the status bar and System panel
    config: {
      org: 'APEX STUDIO', sensorLabel: 'SAT VHR',
      defaultSite: 'my-site-id',                    // site Orbital opens on; otherwise the first site from sites()
      persistChat: true,                            // false: never save the agent conversation in this browser
      marketHolidays: ['2026-12-25'],               // optional override of the built-in NYSE calendar (New York dates)
      marketEarlyCloses: ['2026-12-24'],            // optional override; early closes end at 1:00 pm ET
      agentModel: 'Analyst 2',                      // optional; otherwise the system() model whose role mentions reasoning/agent
      segmentationModel: 'SegNet 4',                // optional; otherwise the system() model whose role mentions segmentation
      agentPrompts: ['Brief me', 'What changed overnight?'],  // optional suggested prompts (first three show in the composer)
      allowDemo: false,                             // live backends hide demo mode unless this is true
      watchlist: ['SPX', 'CL1', 'BRN'],             // optional first-run watchlist (otherwise the six KPI symbols); the user's own list is kept after that
    },
    api: { watchlist, macro, imagery, ask /*, optional methods */ },
  };
</script>
```

Every method may return a value or a Promise. All timestamps are epoch milliseconds, UTC. Every response carries `asOf` so the UI can show freshness and mark data older than 15 minutes as stale.

## Required

### `watchlist({ symbols })` → `{ asOf, source, quotes: Quote[] }`
Polled every second. `symbols` is the user's watchlist plus the six KPI symbols.

```ts
Quote = {
  sym: string; name: string;
  kind: 'index' | 'commodity' | 'metal' | 'yield' | 'fx' | 'vol';  // drives formatting: fx 4 dp, yield 3 dp + bp deltas, else 2 dp
  px: number; prev: number;        // last and prior settle
  chg: number; chgPct: number;     // chg in price units (percentage points for yields), chgPct as a fraction (0.0231)
  hi?: number; lo?: number; ts: number;
  spark?: number[];                // optional, recent intraday points for the 60x20 sparkline
}
```

### `macro({ tf })` → `{ asOf, source, tf, kpis: Kpi[], series: Series[], signals: Signal[] }`
`tf` is `'1D' | '1W' | '1M' | '1Y'`. KPI deltas are over the window, so the cards and the chart change together. Echo `tf` back; if it is missing the UI assumes the answer is for the timeframe it asked for.

```ts
Kpi    = { slot: 'Index'|'Commodity'|'Metal'|'Yield'|'Dollar'|'Vol'; sym; name; kind; value; chg; chgPct; tf }
Series = { id: sym; name; kind; points: [ts, value][] }
Signal = {                                        // physical overlay markers (amber ring + label)
  id; t: ts; sym;                                 // attach to this series at this time
  site; segId; pass; label;                       // e.g. "EL SEGUNDO fill −11.4 pp"
  rule: string; metric: string; unit: string; conf: number;
  raw: { t: ts; v: number }[];                    // the series shown in the marker popover
}
```

### `imagery({ site, pass? })` → `{ asOf, site: Site, passes: PassMeta[], pass: Pass, prior: Pass | null }`
`pass` is a pass id or index; omit it for the latest. `prior` is the pass before it and powers the compare slider and drawer thumbnails.

```ts
Site     = { id; name; short; type; region; cls; key? }       // key = segment id of the site's headline signal
PassMeta = { id; i; ts }
Pass     = {
  id; i; ts;
  sensor: string; gsd: number; model: string;                 // provenance in the HUD
  imageUrl: string | null;                                    // live: the image (same-origin or CORS-enabled), 16:10, e.g. 1600x1000
  scene?: object;                                             // scaffold only: procedural scene; ignored when imageUrl is set
  segments: Segment[];
}
Segment  = {
  id; label; cls: 'energy' | 'logistics' | 'maritime' | 'industrial';
  hud: boolean;                                               // show a HUD label on the imagery
  conf: number;                                               // 0..1, numeric everywhere
  geom: { t: 'circle'; cx; cy; r } | { t: 'poly'; pts: [x, y][] };   // normalized: x and r by width, y by height
  area_m2: number;
  metric: { name; value; unit; prior; delta; deltaUnit?; digits? };
  rule: string;                                               // detection rule shown in the drawer
  extra?: { name; value; unit }; status?: string;
}
```

Keep segment ids stable across passes so the drawer can follow a segment when the user steps passes. Treat a pass as immutable once served: the UI caches explicit passes for the session (only the latest pass expires, after 60 s), so changing a pass under the same site, id, and index will not be picked up until reload — issue a new pass id instead.

Pass ids only need to be unique within a site. `i` is the pass's position in `passes` for this response; a rolling window (index 0 = oldest pass kept) is fine, because the UI checks every response's pass list and drops cached passes whose index now names a different pass.

Images must be 16:10. Segment coordinates are normalized to the full frame, so the viewer draws the image edge to edge at 1280x800 and does not letterbox; another aspect ratio is stretched and a console warning names the image. Crop or pad on the server.

### `ask({ prompt, context, onToken, signal })` → `{ text, sources, confidence, missing?, model? }`
Call `onToken(chunk, textSoFar)` as tokens arrive to stream; resolve with the final answer. Honour `signal` (an `AbortSignal`) when the user presses Esc.

```ts
context = { view; pins: Pin[]; quotes: Quote[]; site: string; segment: { site; id; pass } | null }
result  = {
  text: string;                                   // answer first; paragraphs separated by blank lines
  sources: { label: string; route: string }[];    // route is a TERRATERM route, e.g. "orbital/ela-segundo-tanks/grp-b"
  confidence: number;                             // 0..1, rendered with two decimals
  missing?: string[];                             // what the agent could not see
}
```

## Optional

In live mode an omitted method is simply off: its panel stays empty ("Not connected" on F5 and F6) and the System panel lists it. Live mode never fills gaps with synthetic data. New passes reach Orbital when `sites()` reports a newer `latestPass`; without `sites()` a reload picks them up.

| Method | Returns | Used by |
|---|---|---|
| `sites()` | `{ asOf, sites: Site & { latestPass, segments, keyLabel, keyMetric, keyConf, keySeries?, cadenceH? }[] }` | F7, palette, site selectors. `cadenceH` is the revisit interval in hours; without it F7 shows a dash |
| `quotes({ kind })` | `{ asOf, source, kind, rows: Quote & { volume, oi, spark }[] }` | F5 (`commodities`), F6 (`fx`) |
| `series({ sym })` | `{ asOf, sym, name, kind, points }` | chart drawer in F5/F6 |
| `flow()` | `{ asOf, source, unit, categories, t: ts[], series: { [cat]: number[] } }` | Capital flow |
| `wire()` | `{ asOf, source, items: { id, ts, tag: 'macro'\|'geo'\|'alert', head, sum, src, url?, site?, syms? }[] }` | Wire |
| `events({ since })` | `{ asOf, events: Event[] }` where `Event.seq` increases | Alerts, timeline, proactive agent |
| `system()` | `{ asOf, mode, models: { name, role, where, status, latencyMs }[], context: { used, max }, sourcesFused }` | System panel, status bar |

`Event` is `{ seq, ts, type: 'alert' | 'pass' | 'macro' | 'system', ... }`. Alerts carry `{ id, sev: 'high'|'med'|'low', subject, message, conf?, site?, segId?, route?, proactive? }`; `proactive: true` makes the agent post a system message in its log.

## Polling and budgets

| Data | Interval |
|---|---|
| watchlist | 1 s |
| events | 2 s |
| system | 3 s |
| wire | 5 s |
| macro (when F1 is open) | 5 s |
| quotes (when F5/F6 is open) | 2 s |
| sites | 15 s |
| flow | 30 s |

Failures back off 1, 2, 4, 8, 15 s. While the feed is down, panels keep the last data with a stale ribbon and a retry button. Optional feeds (wire, events, system, flow, sites) report their own health: a failing one marks its panel stale without taking the main feed down.

Wire `url` values must be `http(s)`; anything else is not rendered as a link.

## Routes

`#/desk`, `#/macro`, `#/orbital/<site>[/<segment>]`, `#/agent`, `#/flow`, `#/commodities[/<sym>]`, `#/fx[/<sym>]`, `#/intel`, `#/alerts`, `#demo`. Bare-token forms also work, for hosts that only pass simple anchors: `#orbital.san-pedro-port`, `#macro`.

## Labels

The UI hardcodes no model, sensor, site or company names. With a live backend every name comes from your responses (`system().models`, `pass.sensor`, `pass.model`, `sites()`) or from `config`; when neither says, it shows a neutral word ("Agent") or nothing. `org` shows only when you set it.

## Demo mode

`#demo` or the palette runs the scripted scaffold dataset. With a live backend it is hidden (no palette command, no `N` key in the shortcut sheet, `#demo` opens the desk) unless `config.allowDemo` is true. It never writes the user's pins, conversation or acknowledgements to storage, and exiting returns to the backend that was running before (live or scaffold).

## Scaffold debug hooks (scaffold mode only)

`TERRATERM.debug.feed(false|true)` simulate an outage, `setContext(n)` set context tokens, `fireScheduled()` release scheduled alerts now, `fireWire()` release the next wire item.
