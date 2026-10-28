# TERRATERM acceptance report

2026-10-28T03:46:13.734Z · 63/63 checks passed · Chromium 156.0.8078.4

| Id | Check | Result | Detail |
|---|---|---|---|
| 0 | Contract: a live backend with only the four required methods runs; missing methods are labeled | PASS | LIVE mode · imageUrl imagery · not connected: sites,quotes,series,flow,wire,events,system |
| 8.1a | Desk: all six panels render from the API contract | PASS | 6 panels · 14 quotes · 20 segments · 10 events |
| 8.1b | Desk: UTC clock ticks | PASS | 03:44:21Z → 03:44:22Z |
| 8.1c | Desk: watchlist rows flash on update (12% green/red, 400 ms) | PASS | rgba(0, 217, 126, 0.12) |
| 8.1d | Desk: nothing overflows at 1440 x 900 | PASS | document 1440x900, no clipped panels, KPIs or prices |
| 8.2a | Macro: timeframe switch updates chart and KPI deltas together | PASS | 1D ▲ +2.31% 1D → 1W ▲ +6.16% 1W |
| 8.2b | Macro: physical overlay shows markers; marker opens rule and raw series | PASS | 4 markers · "EL SEGUNDO fill −11.4 pp" · 6 raw passes |
| 8.3a | Orbital: selecting a pass updates HUD, legend count and drawer | PASS | pass 5 → 4 ([) → 2 (selector) |
| 8.3b | Orbital: compare slider aligns the same geography | PASS | static region diff 0.00 · tank group diff 7.6 · ◀ CURRENT 2026-10-28 03:06Z  │  PRIOR 2026-10-27 03:06Z ▶ |
| 8.3c | Orbital: play loops through the last 6 passes | PASS | visited passes 0,1,2,3,5 |
| 8.3d | Orbital: drawer shows class, confidence, area, change, prior thumbnail, Ask agent | PASS | confidence 0.87 · −11.4 pp · prior thumbnail brightness 128 |
| 8.3e | Orbital: min confidence 0.80 by default; class isolate; text alternative | PASS | 2 low-confidence segments hidden · list mirrors 18 visible |
| 8.4a | Agent: "Brief me" streams, cites panels, numeric confidence, under 5 paragraphs | PASS | 4 paragraphs · 5 sources · confidence 0.78 |
| 8.4b | Agent: tank drawdown answer fuses imagery with crude, cites both | PASS | WTI is +2.31% · correlation −0.64 · conf 0.83 |
| 8.4c | Agent: says what is missing instead of inventing; refuses trade orders | PASS | unknown → conf 0.22, missing "a source covering this question" · trade order declined |
| 8.5 | Flow: hover shows exact values; ABS/SHARE re-renders without reload | PASS | 2026-10-26 22:00Z FX264.0 Rates273.6 Metals149.0 Energy193.2… |
| 8.6a | Commodities: 200 rows, sort is instant | PASS | 200 rows sorted in 1.9 ms (click to paint 65 ms) |
| 8.6b | Commodities: selection syncs with the watchlist pin | PASS | pin in F5 → desk row → Delete → F5 cleared → chart drawer |
| 8.6c | FX: 200 pairs at 4 decimals, sortable | PASS | sorted in 1.9 ms |
| 8.7 | Satellite intel: clicking a site opens Orbital with segments loaded | PASS | 6 sites · San Pedro Bay with 50 segments |
| 8.8a | Alerts: new alert arrives with toast and status count; acknowledge clears both | PASS | active 2 → 4 (toast, agent log) → 3 after ACKNOWLEDGE |
| 8.8b | Alerts: rules builder fires on threshold plus channel | PASS | 2 rules · CL1 rule fired |
| 8.9 | Wire: headline expands summary and source; geo items deep link to Orbital; filters | PASS | expanded with source · 6 geo items · deep link → san-pedro-port |
| 8.10 | System: context bar amber past 70%, red past 90%; scaffold wiring hint | PASS | 50% blue · 75% amber · 95% red |
| 7a | Navigation: F1 to F8 and Alt+digits switch views; function bar marks the active view | PASS | F1–F8, Alt+3, Alt+0 |
| 7b | Navigation: every view is URL addressable, including bare-token links | PASS | #/orbital/ela-segundo-tanks  #orbital.san-pedro-port  #/commodities/CLZ6  #macro  #/alerts |
| 7c | Navigation: "/" palette fuzzy search, arrows, Enter, digits 1 to 8 | PASS | "port" → San Pedro Bay Container Port · 5 → commodities |
| 7d | Navigation: "?" shortcut sheet; Esc closes it and returns focus; Esc returns to last panel | PASS | sheet → Esc → row → Esc → #panel-watch |
| 13a | States: feed outage shows red dot, stale ribbon, "Feed disconnected. Retrying." and recovers | PASS | STALE · LAST UPDATE 03:44:52Z · last data kept (14 rows) · recovered |
| 13b | States: data older than 15 minutes is marked stale automatically | PASS | 16-minute-old quotes show the stale ribbon |
| 13c | States: table skeleton rows for at least 400 ms; imagery shows "Loading pass…" | PASS | 18 skeleton rows for 436 ms · imagery placeholder shown |
| 13d | States: empty states use the blueprint microcopy | PASS | alerts and watchlist empty states |
| 14 | Motion: reduced motion disables pulse, flash and transitions | PASS | data-motion=reduce, no flash, no pulse |
| 15a | Accessibility: axe-core finds no serious or critical issues on any view | PASS | 9 views clean |
| 15b | Accessibility: amber 2px focus ring; direction never by color alone; live region | PASS | rgb(255, 159, 28) 2px solid |
| 15c | Accessibility: touch targets at least 32 px on touch devices | PASS | smallest visible target 32 px, no horizontal scroll at 390 px |
| 16a | Performance: first paint under 1 second | PASS | first contentful paint 40 ms |
| 16b | Performance: quotes update at most 4 per second; charts re-render at most 2 per second | PASS | 2 quote updates and 4 chart renders over 2 s |
| 4 | Responsive: below 1100 px bottom row hides and 2 columns; below 800 px single column, view only | PASS | 1000 px: 2 columns, bottom row hidden · 700 px: stack, view only · 400 px: no side scroll |
| 17 | Layout: panels resize and reorder by keyboard; layout survives reload; reset works | PASS | left column 300 → 332 px, watchlist moved to slot 1, both persisted, reset restores |
| 2 | Persistence: pins, conversation and preferences survive reload | PASS | HG1 pinned, 2 messages, tape on |
| 18 | Demo: 90-second run, one keypress per beat, keyboard only | PASS | 5 beats in 5 s · crude +2.31% · confidence 0.83 · 184K / 1M |
| R-H1 | Live mode: a missing optional method stays off; nothing synthetic appears | PASS | no alerts, wire, flow, sites or system data · F5 "Not connected: backend has no quotes() method." |
| R-H2 | Live mode: a class-instance backend is used, not the scaffold | PASS | 2 live calls · SPX 100 |
| R-H3 | Macro: KPI cards bind by symbol; a missing KPI shows a dash and the chart still draws | PASS | SPX=100.00 CL1=101.00 HG1=102.00 US10Y=103.00 DXY=104.00 VIX=— |
| R-H4 | Router: a malformed percent-encoded link still boots | PASS | booted on orbital |
| R-M1 | Orbital: a newer pass announced by sites() appears without a reload; live default site comes from sites() | PASS | opened on tank-a · passes 1 → 2 |
| R-M2 | Orbital: RETRY fetches a failed image again | PASS | failed once, RETRY refetched, pass drawn |
| R-M4 | Demo mode: leaves saved pins and chat alone and returns to the live backend | PASS | storage kept during demo · back to LIVE with 1 pin and 1 message |
| R-M5 | Rules: "Agent log only" posts to the agent without a toast | PASS | agent log entry, no toast |
| R-M6 | F5/F6: instruments added or dropped by the feed appear and disappear | PASS | AAA,BBB,CCC → BBB,CCC,DDD,EEE |
| R-M7 | F5: an unknown symbol in the link stops waiting and says so | PASS | toast shown, polling stopped |
| R-L1 | Wire: only http(s) source links are rendered | PASS | javascript: dropped · https kept |
| R-L2 | Agent: RETRY replaces only the failed answer and its prompt | PASS | 4 messages, newest kept |
| R-L3 | Optional feeds: a failing wire or events feed marks its own panel stale; the main feed stays live | PASS | feed live · wire "unavailable" · timeline NO DATA YET · RETRYING |
| R-L5 | Macro: physical-signal labels never overlap | PASS | 4 labels, 0 overlaps |
| R-L5b | Orbital: the segment drawer leaves the segment list visible | PASS | list 300 px, segment names 146 px, clear of the drawer |
| R-L7 | Market clock: NYSE holidays and early closes | PASS | Dec 25 HOLIDAY · Dec 24 noon OPEN · EARLY CLOSE · Dec 24 1:30 pm CLOSED · Oct 26 OPEN |
| R-L8 | Privacy: turning off conversation saving deletes the stored copy and stops saving | PASS | stored copy deleted, nothing saved after |
| R-LIVE-a | Live label sweep (required methods only): no demo, mock or scaffold wording anywhere | PASS | 9 views, 2 drawers, agent answer, palette, shortcut sheet: clean |
| R-LIVE-b | Live label sweep (every optional method too): no demo, mock or scaffold wording anywhere | PASS | clean · agent panel "Analyst 2 · cloud · ctx 1K / 200K" · org NORTHWIND CAPITAL |
| R-SCALE | Scale: a 2,000-instrument feed updates in under 100 ms and off-screen rows paint when scrolled to | PASS | 3 updates, worst 4 ms · S1999 painted on scroll |
| 99 | No console errors across the whole run | PASS | clean |
