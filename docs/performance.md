# Performance notes

Measured on the production build (`pnpm build && pnpm bundle`), Windows 11, Node 22, local server. Numbers are from this machine and one run; they are budgets and evidence of what is wired, not field claims.

## Client JavaScript

| | Raw | Gzip | Brotli |
|---|---|---|---|
| First load before lazy-loading analyst surfaces | 859.0 KB | 261.3 KB | 227.5 KB |
| **First load now (13 scripts)** | **790.7 KB** | **240.6 KB** | **209.5 KB** |

Internal budget: <= 300 KB gzip for the first load, excluding deferred chunks. Met with 59 KB of headroom.

Deferred (loaded only when the surface renders): Recharts about 90 KB gzip, the map (react-simple-maps + 105 KB TopoJSON) about 66 KB gzip, radar 8 KB gzip, plus the analyst chunks (heatmap, comparison, alert rules and react-hook-form).

`pnpm bundle` regenerates `docs/performance/bundle.json`.

## What keeps streaming smooth

- Tokens are buffered and applied once per animation frame (`use-assistant.ts`), never per token; unit-tested that no token is lost to the batching.
- The dashboard is a different subtree from the transcript and its selectors are memoised on `(dataset, period, scope)`, so a token does not recompute any aggregate.
- Charts, the map and the analyst surfaces are lazy with reserved space, so late chunks do not shift the layout (cumulative layout shift is measured below).

## Lighthouse

See the "Measured" section of the README (desktop preset, local production server, one run, with the machine noted).
