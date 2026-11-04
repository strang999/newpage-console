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
| Mobile (Moto G class, 4x CPU, slow 4G), 3 runs | 91-92 | 100 | 100 | 100 | 0.9 s | **2.7 s** (2.71-2.73) | 230-255 ms | 0 | 1.4-1.6 s |

Machine: Windows 11 desktop, Chrome headless, local `next start`. These are lab numbers from this machine, not field data; no field Core Web Vitals pass is claimed.

**What changed the mobile LCP (4.2 s -> 2.7 s, score 81 -> 91-92):** the trend chart (Recharts, 90 KB gzip) and the map (66 KB gzip) were lazy chunks, but they were still requested during hydration. Lighthouse's simulated mobile run counts that download and the main-thread work around it against LCP. `RenderWhenNear` (`src/shared/ui/render-when-near.tsx`) now mounts them only when the placeholder is within 150 px of the viewport, so a phone that never scrolls to them never downloads them (asserted by an e2e test that watches the script responses). Everything stays reachable: the table alternative is in the DOM from the start, the placeholder says the chart loads as you scroll, and without IntersectionObserver the chart mounts straight away. Tradeoff: scrolling to a chart shows a short loading state instead of an already-drawn chart.

**Known gap:** the simulated-mobile LCP (2.7 s) is still over the 2.5 s target. The LCP element is a text node already in the server-rendered HTML, so what remains is the simulated 4x CPU slowdown hydrating React and Next (react-dom alone is about 1.7 s of scripting under that throttle). Likely next steps: render the health strip as a Server Component, stop embedding the 300 KB dataset in the HTML and hydrate only what the visible surfaces need, drop react-query and zod from the first load by validating on the server only (zod/mini). An earlier trial of idle-gating the chart mount after it became visible lowered TBT slightly but did not change LCP, so it was removed. Field Core Web Vitals are reported by the `web-vitals` adapter (see F09) and would be the real proof.
