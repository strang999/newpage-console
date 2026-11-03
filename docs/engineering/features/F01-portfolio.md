# F01 - Portfolio health

Status: implemented, locally verified (P1, 2026-11-03). CI/preview results in STATUS.md.

## Outcome and scope

The user sees verified portfolio totals, status counts and a 13-market table computed from the monthly facts, with supplied snapshot fields labelled as such.

In: dataset Zod schema (+ referential/completeness checks), pure aggregates, formatters, server loader with Query hydration, KPI strip, market table.
Out: period picker and drill (F02), charts, assistant.

## Contracts

- `domains/market` public API: `datasetSchema`, `metricsFor`, `metricsFromFacts`, `marketRows`, `portfolioHealth`, `statusCounts`, types. No React.
- Percentages are recomputed from summed amounts; zero denominator returns `null` (rendered `N/A`). Never an average of market percentages.
- Provenance: revenue/growth/attainment/gap are derived; share and status are the supplied latest-period snapshot (footnote + `*` column labels + KPI note).
- State owner: dataset lives in the TanStack Query cache, hydrated once by `app/page.tsx` from `app/_server/dataset.ts` (`server-only`, validated once per process). Features receive a typed `Dataset` prop.

## Acceptance evidence

- Golden tests compare portfolio, 4 regions and 13 markets (actual, forecast, prior year, units, gap exact; growth and attainment to 2 dp) with the independent `docs/data-audit.json`; 7/4/2 status counts; 6 needing attention.
- Schema rejects: negative amount, unknown market, duplicate fact, unknown status, malformed period.
- Component tests: KPI strip values, 13 rows + status text, `N/A` for zero prior year, one h1, keyboard-reachable scroll region.
- Playwright (desktop 1440x900, mobile 390x844): figures on page, 13 rows, Germany row `$1,676,586 / -9.7% / Off track`, axe wcag2a/2aa/21aa clean, zero console errors, table scrolls inside its own region (no page overflow). Screenshots: `docs/evidence/P1/`.
- Test-found defect fixed: duplicate "Markets" region landmark (section + scroll container).

## Known limitations

- Snapshot status disagrees with derived numbers in places (e.g. Spain is off track with 104.7% derived attainment); shown as supplied and labelled, documented later in `docs/data-quality.md`.
- Only the latest period is shown until F02.
