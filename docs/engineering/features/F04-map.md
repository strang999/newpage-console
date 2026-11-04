# F04 - Choropleth map

Status: implemented, locally verified (P4, 2026-11-04).

## Outcome

Choose a country on a choropleth coloured by revenue, growth, attainment or status; the dashboard drills into that market; the same values are available as a table; everything works by keyboard.

## Contracts

- `domains/market/map-scale.ts` (pure): `buildMapScale(metric, rows)` -> classes with numeric labels, `classify(row)`, `valueText(row)`, `source` (derived vs supplied snapshot). Revenue: 5 equal-width bins over the markets shown. Growth bounds `-5, 0, 5, 10`; attainment `95, 98, 102, 105` (fixed so a period change never silently rescales). Classification uses the one-decimal value the UI shows, so a market never sits in a class its label contradicts (US growth 9.991 shows +10.0% and is in "10% and above").
- `domains/market/geo.ts`: ISO3 -> numeric id (world-atlas key) for the 13 markets; verified against the shipped TopoJSON.
- `features/market-map`: no business math in components; lazy `map-canvas` (react-simple-maps 5, React 19 compatible; no fallback to d3-geo was needed). Geometry: `data/countries-110m.json` (world-atlas 2.0.2, Natural Earth, public domain; attribution in `data/README.md`). It is imported by the lazy chunk instead of served from `public/maps` so the map has no runtime fetch to fail.
- Metric is URL state (`metric`), market selection goes through the host's `onSelectMarket` -> `navigate({market})`.

## Accessibility

13 market countries are `role=button`, `tabindex=0`, `aria-label` "Germany: Revenue $1.68M. Press Enter to open.", `aria-pressed`, in dataset order; decorative countries are `aria-hidden` and `tabindex=-1` (the library focuses every path by default; axe `aria-hidden-focus` caught it). No-data countries are hatched (not only grey); legend lists numeric stops; readout line on hover/focus; Table view with the same values and status as icon + text; forced-colors focus stroke; radio group for the metric.

## Evidence

- 21 domain tests (13/13 geometry ids, scale bins incl. boundary rounding, no-data), 8 component tests (13 buttons, Enter/Space/click, selected state, readout, legend, metric radios, status snapshot label, table alternative).
- Playwright desktop + mobile: click Germany -> `?region=eu&market=de`, h1 "Germany"; Tab order Canada -> Germany -> Enter; metric in URL survives reload; period picker recolours; table drills; axe clean; no console errors. Screenshots `docs/evidence/P4/`.
- Defects found by tests and fixed: decorative countries were focusable (ARIA/axe); the map's Table toggle collided with the trend panel's.

## Review-driven changes

Focus and selection are drawn by a two-tone overlay (white halo under a dark stroke) rendered after all countries, because a stroke on the path itself is half-covered by neighbours and can match the fill. Status has a texture per class (dots, stripes, cross-hatch) mirrored in the legend. Market outlines are dark and thin so the lightest classes keep a visible edge. The readout resolves hover and focus against the current rows. Legend ranges are half-open ("5% to under 10%", "10% and above") so a shared bound belongs to one class; tests read the bounds back from the labels and scan all 24 periods.

## Limits

No zoom/pan (not required). Small countries are tiny at 110m resolution; the table and the drill list cover them. France includes French Guiana in the 110m geometry.
