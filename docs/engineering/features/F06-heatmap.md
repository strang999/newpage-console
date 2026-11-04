# F06 - Risk heatmap and coordinated views

Status: implemented, locally verified (P6, 2026-11-04).

## Outcome

A markets x months grid of forecast attainment minus 100 (percentage points) shows where risk sits. Selecting a cell sets market and month in the URL, and every other view follows.

## Contracts

- `domains/market/heatmap.ts` (pure): `buildHeatmap(dataset, {regionId})` (rows = the region's sibling markets or all 13; 24 periods), `classifyGap`, `HEATMAP_BOUNDS = [-6, -2, 2, 6]` (fixed; data spans -9.2 to +7.2 pts), `formatGapPts`, `describeCell`. Classification uses the displayed one-decimal value; tests read the bounds back from the legend labels.
- `features/risk-heatmap`: a real `<table role="grid">`; cells are `<button>`s with roving tabindex (one tab stop; arrows, Home/End, Page Up/Down, Ctrl+Home/End); every cell shows its number and has an accessible name ("Germany, Mar 2026: 92.2% of forecast, 7.8 points under forecast"); the selected cell has `aria-selected`, `aria-pressed` and an inset two-tone ring (not only colour); keyboard focus is a separate dark outline with a white halo; text on the dark classes is white (contrast checked in `scripts/check-contrast.mjs`).
- Host wiring: `onSelect({market, period})` -> `navigate({market, period})`; market implies region, so the grid keeps the region's markets and does not collapse to one row.

## Defects found by tests and fixed

- A pointer press focused the cell, which scrolled the grid (sticky market column) between press and release, so the click landed on the table and was lost on touch. Pointer presses no longer move focus; the container reserves scroll padding for the sticky column. (Found by the mobile coordinated-views e2e.)
- Duplicate region landmark (section + scroll container): fixed.

## Evidence

- 9 domain tests (13x24 and 5x24 shapes, values equal the independent audit and per-market metrics, every class used, bound consistency), 9 component tests (grid shape, headers, names, roving tab stop, all keys incl. clamping, click/Enter/Space, selected marking, legend, pointer-press behaviour).
- Playwright (desktop + mobile): map click -> heatmap narrows to Europe (5 rows) -> heat cell Germany/Mar 2026 -> URL `?region=eu&market=de&period=2026-03&...`, h1, breadcrumb, period picker, time-series summary and marker, radar table ($1,211,930), map selection and the single selected cell all follow; back undoes the heat pick then the map pick; keyboard journey (ArrowDown x2, ArrowRight -> France Apr 2026, Enter -> `market=fr&period=2026-04`); axe clean; focus outline asserted; mobile grid scrolls inside its container without page overflow.
