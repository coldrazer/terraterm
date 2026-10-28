# TERRATERM · 90-second judging run

Open `dist/terraterm.html#demo` (or press `/` and choose **Start demo mode**). Demo mode loads the scripted dataset: WTI pinned at +2.31%, El Segundo group B drawdown at confidence 0.87, context landing on 184K of 1M, and the port anchorage alert timed to beat 4. A **DEMO** badge sits in the top bar; the status bar shows the clock and beat.

Every beat is one keypress. `N` performs the next beat if you lose your place.

| Beat | Time | You press | Judge sees | Say |
|---|---|---|---|---|
| 1 | 0–10 s | (page loads) | Market numbers left, segmented tank farm center, agent right | "Bloomberg terminal, pointed at the physical world." |
| 2 | 10–30 s | Click **TK GROUP B · DRAWDOWN**, or `N` | Drawer: drawdown, confidence 0.87, −11.4 pp, prior vs current thumbnails | "Every tank roof is segmented and measured, pass over pass. This run is our scripted dataset; live imagery plugs into the same view." |
| 3 | 30–55 s | **ASK AGENT** in the drawer, or `N` | Streaming answer: −11.4 pp, WTI +2.31%, correlation, sources, confidence 0.83 | "Ground truth and price, in one answer, with its sources." |
| 4 | 55–75 s | `/` type `port` Enter, then `P` (or `N`) | Orbital jumps to San Pedro Bay; the pass loop shows the anchorage filling week over week. The anchorage alert lands as a toast and an agent log entry. | "Congestion building for six straight weeks. The agent flagged it before we asked." |
| 5 | 75–90 s | `F1` (or `N`) | Macro dashboard with physical markers on the chart. Status bar: Glimmer 30B local, CTX 184K / 1M | "Frontier reasoning up top, local agent always on, priced for everyone." |

## Before you present

- Say it out loud once: this is the scripted scaffold dataset (the status bar reads SCAFFOLD). The imagery is generated and the model names in the status bar are placeholders, not a live SAM, Spark or Glimmer deployment. Don't call it live.

- Project at 1920×1080 if you can. Everything reads from 3 m at that size.
- Run `npm test` once on the presenting machine; check 18 confirms the beats end to end.
- Some browsers keep `F6` for the address bar. `Alt+1`…`Alt+8` switch views too.
- Esc closes the drawer, the palette or a running answer, and returns focus to the last panel.
- To reset: reload the `#demo` link. Demo mode clears the conversation, pins and acknowledgements.
