# F07 - Executive and analyst audiences

Status: implemented, locally verified (P7, 2026-11-04).

## Outcome

One dataset, two compositions. `mode=executive` (the default, omitted from the URL) answers "how are we doing and where do I look first?". `mode=analyst` shows every metric and every drill path. The mode is URL state, so a shared link carries the audience; switching keeps every selection.

| | Executive | Analyst |
|---|---|---|
| Headline | health strip: 4 numbers | same strip |
| Trend | yes | yes + next-level drill table |
| Risks / movers | Top risks (5, status + attainment + gap), Top movers (5, direction + $ + growth) | dense all-markets table (revenue, forecast, gap, growth, attainment, units, share*, status*, sortable by keyboard, drill column) |
| Map | yes | yes |
| Heatmap, comparison radar | no | yes |
| Assistant | yes | yes |

## Contracts

- `domains/market/highlights.ts` (pure): `topRisks` (flagged markets, off track first, then attainment ascending; status is the supplied snapshot, attainment and gap are derived, so they can disagree - Spain is off track at 104.7% - and both are shown), `topMovers` (by absolute YoY revenue change, up or down), `sortMarketRows` (stable, N/A always last, name tie-break). Expected orders in tests are recomputed from `docs/data-audit.json`, not from the code under test.
- `features/executive-summary`: Top risks and Top movers. `features/portfolio-overview` now exports `PortfolioHealth` and `MarketsTable` (plus the composite). `features/market-explorer` gained slots (`actions`, `afterHeader`, `showChildren`) so the host composes without feature-to-feature imports.
- `app/_components/dashboard.tsx` is the only place that knows both compositions and the assistant drawer; `mode-toggle.tsx` is a labelled radio group.
- Phone (< xl): the assistant is a full-screen drawer opened by "Ask the assistant" (`aria-expanded`, `aria-controls`). The panel stays mounted while closed, so the conversation and a running generation survive; Escape or "Close assistant" closes it and returns focus to the opener; "Open in dashboard" from the evidence drawer closes it so the change is visible (this closes the P3 known gap).

## Visual system pass

Shared `.card` surface (border, radius, shadow, padding scale), sticky header with a mark, 24px page title, consistent spacing (24px section gap), numeric columns right-aligned with tabular numerals, status as icon + text everywhere, dense analyst table at 13px.

## Defects found by tests and fixed

- Focusing a map country changed the readout line (two lines on a phone), shifting layout between press and release, so taps on the 8px Germany were lost. The readout now reserves its height.
- Double negative "-$141,058 under" in top risks; now "$141,058 under".
- Synthetic Alt+Arrow cannot trigger browser Back in headless Chromium, so that e2e asserts the keydown is not default-prevented instead.

## Evidence

- 9 selector tests (audit-derived orders, N/A last, no mutation), 4 ExecutiveSummary component tests, 2 ModeToggle tests, 7 overview tests incl. sorting by click and keyboard.
- Playwright desktop + mobile: executive default has no analyst surfaces; health strip has 4 numbers (<= 8) above the fold; top risks/movers content and drill; toggling keeps region/market/period/metric and writes/removes `mode`; analyst table shows 11 columns and sorts by keyboard with `aria-sort`; axe clean in both modes and with comparison open; phone stacks without horizontal overflow; drawer keeps a running answer across close/reopen; Escape returns focus; Open in dashboard closes the drawer. Screenshots `docs/evidence/P7/`.

## Limits

"Above the fold" is asserted at 1440x900 only. The executive view deliberately has no heatmap or comparison; they are one toggle away and keep their state in the URL.
