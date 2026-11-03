# F02 - Explorer, shareable URL, time series

Status: implemented, locally verified (P2, 2026-11-03). CI/preview in STATUS.md.

## Outcome and scope

Drill portfolio -> region -> market -> product, pick a period, share the URL, back/forward works; actual vs forecast vs prior-year chart for the selected scope with a table alternative.

Contracts
- `domains/market/view-state.ts` (pure): `ViewState` (mode, region, market, product, period, metric, compareType, compare, status), `reconcileViewState`, `parseViewState` (returns canonical query + `needsNormalization`), `serializeViewState` (defaults omitted, fixed key order), `selectInView`.
- Reconciliation rules: unknown ids dropped; market implies region (overrides a conflicting region); product needs a market; period must exist else latest; comparison needs 2-4 distinct known ids of one type (more than 4 truncated to 4); invalid mode/metric/status dropped.
- `domains/market/scope.ts` (pure): `timeSeries`, `childRows`, `scopeLabel`, `scopeMetrics`.
- `app/_url/use-view-state.ts` is the only URL adapter: state derived from `useSearchParams`, discrete selections `router.push`, normalization `router.replace`, no mirrored component state. `app/page.tsx` awaits `searchParams` so the page renders per request.
- `features/market-explorer` takes `scope`, `period`, `onSelect(ScopeSelection)`, `onPeriodChange`; it never imports another feature. Chart is `React.lazy` with a reserved 320px box.

## Acceptance evidence

- 36 view-state/scope unit tests (16 URL normalization cases incl. comma stability so there is no rewrite loop).
- 5 explorer component tests (breadcrumb, drill callbacks, period picker, table alternative, no children at product level).
- Playwright (desktop + mobile): drill Europe -> Germany -> Veltrix -> period 2026-03; reload restores heading, period and breadcrumb; axe clean; back x4 restores each URL/heading, forward works; `/?market=zz&period=1999-01&utm_source=x` -> `/` with exactly one history entry (replace); keyboard Enter on breadcrumb and Space on Table toggle; reduced-motion renders the actual line with `stroke-dasharray: none` (no draw-in animation). Screenshots: `docs/evidence/P2/`.
- Test-found defect fixed: duplicate region landmark in the children table; jsdom lacked `matchMedia` (test setup stub).

## Known limitations

- Chart point exploration relies on Recharts' accessibility layer plus the synchronized table and text summary.
- Compare/metric/status/mode params parse and round-trip but are only consumed by later features.
