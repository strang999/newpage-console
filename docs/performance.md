# Performance notes

Measured on the production build (`pnpm build && pnpm bundle`), Windows 11, Node 22, local server. Numbers are from this machine and one run; they are budgets and evidence of what is wired, not field claims.

## Client JavaScript

| | Raw | Gzip | Brotli |
|---|---|---|---|
| First load before lazy-loading analyst surfaces | 859.0 KB | 261.3 KB | 227.5 KB |
| **First load now (13 scripts)** | **791.3 KB** | **240.9 KB** | **209.7 KB** |

Internal budget: <= 300 KB gzip for the first load, excluding deferred chunks. Met with about 59 KB of headroom. (A first attempt at keeping zod jitless re-exported `z` from a wrapper module and pushed the first load to 299.3 KB gzip by defeating tree-shaking; the side-effect-only `zod-config` module avoids that. See F09.)

Deferred (loaded only when the surface renders): Recharts about 90 KB gzip, the map (react-simple-maps + 105 KB TopoJSON) about 66 KB gzip, radar 8 KB gzip, plus the analyst chunks (heatmap, comparison, alert rules and react-hook-form).

`pnpm bundle` regenerates `docs/performance/bundle.json`.

## What keeps streaming smooth

- Tokens are buffered and applied once per animation frame (`use-assistant.ts`), never per token; unit-tested that no token is lost to the batching.
- The dashboard is a different subtree from the transcript and its selectors are memoised on `(dataset, period, scope)`, so a token does not recompute any aggregate.
- Charts, the map and the analyst surfaces are lazy with reserved space, so late chunks do not shift the layout (cumulative layout shift is measured below).

## Lighthouse 12.8.2 (local production server, headless Chrome, simulated throttling, one run each)

| Preset | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS | Speed index |
|---|---|---|---|---|---|---|---|---|---|
| Desktop | 100 | 100 | 100 | 100 | 0.3 s | 0.6 s | 0 ms | 0 | 0.6 s |
| Mobile (Moto G class, 4x CPU, slow 4G) | 81 | 100 | 100 | 100 | 0.9 s | **4.2 s** | 260 ms | 0 | 1.5 s |

Machine: Windows 11 desktop, Chrome headless, local `next start`. These are lab numbers from this machine, not field data; no field Core Web Vitals pass is claimed.

**Known gap:** the simulated-mobile LCP (4.2 s) is over the 2.5 s target. The LCP element is a text node that is already in the server-rendered HTML, so the delay is the simulated 4x CPU slowdown hydrating about 240 KB of first-load JavaScript (main-thread work 3.2 s, TBT 260 ms), not a late resource. Likely fixes, in order: render the health strip as a Server Component (no client dependency for the first paint), stop embedding the 300 KB dataset in the HTML and hydrate only what the visible surfaces need, drop react-query and zod from the first load by validating on the server only, and trim 135 KiB of unused JavaScript Lighthouse reports. Field Core Web Vitals are reported by the `web-vitals` adapter (see F09) and would be the real proof.
