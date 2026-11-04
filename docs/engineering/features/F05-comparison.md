# F05 - Comparison radar

Status: implemented, locally verified (P5, 2026-11-04).

## Outcome

Pick 2-4 markets or 2-4 regions (never mixed) and compare them on revenue, YoY growth and forecast attainment on one radar, with raw values always beside it. The selection and period are URL state.

## Contracts

- `domains/market/comparison.ts` (pure): `buildComparison(dataset, {type, ids, period})`. Each axis is normalised 0-100 over the **whole peer population** of the period (13 markets or 4 regions), not the selection, so a position never moves when another entity is added. Negative growth is not clipped (population minimum can be negative). min = max -> every entity at the neutral 50, `degenerate: true`, and the UI says so. A missing value (zero denominator) has `null` score and is excluded from the bounds. Share is supplied-snapshot, markets only, shown but never plotted.
- URL: `compareType` + `compare` (rules in `view-state.ts`: 2-4 distinct known ids of one type; invalid sets are normalised away with replace).
- `features/market-comparison`: a half-made selection (0-1 ids) cannot live in the URL, so it is held in a local draft that adopts external URL changes (back/forward, links) and ignores the echo of its own write. The own-write marker is cleared on every URL change (an e2e test found it going stale on back-then-forward).

## Accessibility and honesty

Radar is `role=group` with a text alternative; per-axis text summary (highest/lowest with raw values); raw table always visible with each value's 0-100 position; series differ by colour **and** dash pattern, mirrored in a legend; "How the radar is scaled" lists the exact bounds for the period; checkboxes/radios are native; max 4 enforced by disabling the rest; reduced motion disables animation.

## Evidence

- 11 domain tests (raw values vs `data-audit.json`, population bounds, extremes score exactly 0/100, Germany -9.7% is the minimum and scores 0, scores independent of the selection, regions normalised over 4, period changes values, degenerate axis, null value).
- 11 component tests (empty state + quick start, raw values and positions, scaling note, period, regions, summary, half-made selection kept, max 4, type switch clears, external URL change adopted, back-then-forward).
- Playwright desktop + mobile: pick three markets -> URL, values, 3 radar polygons, reload restores, period picker updates values; regions comparison; invalid URLs normalised; back/forward; axe clean. Screenshots `docs/evidence/P5/`.

## Limits

Radar axes are fixed to the three required KPIs (share is not plottable: it only exists for the latest period). Positions are relative to the peer set, which the UI states.
