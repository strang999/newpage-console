# Performance notes

Measured on the production build (`pnpm build && pnpm bundle`), Windows 11, Node 22, local server. Numbers are from this machine and one run; they are budgets and evidence of what is wired, not field claims.

## Client JavaScript

| | Raw | Gzip | Brotli |
|---|---|---|---|
| First load before lazy-loading analyst surfaces | 859.0 KB | 261.3 KB | 227.5 KB |
| **First load now (12 scripts)** | **650.9 KB** | **200.7 KB** | **174.5 KB** |

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
| Mobile (Moto G class, 4x CPU, slow 4G), 5 runs | 97 | 100 | 100 | 100 | 0.9 s | **2.52 s** median (2.44-2.57) | 70-90 ms | 0 | 0.9 s |

Machine: Windows 11 desktop, Chrome headless, local `next start`. These are lab numbers from this machine, not field data; no field Core Web Vitals pass is claimed.

**What changed the mobile LCP (4.2 s -> about 2.5 s, score 81 -> 97).** Four changes, each measured on its own:

1. The trend chart (Recharts, 90 KB gzip) and the map (66 KB gzip) are fetched only when scrolled near (`RenderWhenNear`, `src/shared/ui/render-when-near.tsx`): 4.2 s -> 2.7 s. The table alternative is in the DOM from the start, and without IntersectionObserver the chart mounts straight away. The trade-off is a short loading state when you scroll to a chart.
2. The assistant (stream client, reducer, schemas) is a lazy chunk: it mounts on a wide screen, or the first time the drawer is opened on a phone. The first load no longer carries the validation library (about 35 KB gzip). To get there, URL parsing stopped using zod (`status-values.ts`) and `"sideEffects"` in `package.json` lets the bundler drop unused schema exports (the zod config module is whitelisted, because it must run): 2.7 s -> 2.57 s.
3. The dataset travels in a compact wire form (`domains/market/wire.ts`): the 1,560 facts as one flat list of numbers instead of repeated objects. The HTML went from 259 KB to 84 KB (39 KB -> 31 KB gzip). This did not move the lab LCP by itself, but the document is on the critical path of every real first paint.
4. `web-vitals` is imported when the browser is idle, and the Ctrl+K dialog is a lazy chunk: 2.57 s -> 2.52 s.

Tried and reverted: inlining the CSS (`experimental.inlineCss`) made first paint slower (0.91 s -> 1.03 s) because the document grew; gating the chart mount on idle time lowered TBT slightly and left LCP unchanged.

**Where it stands:** the simulated-mobile LCP is at the 2.5 s target, not clearly under it (five runs, 2.44 to 2.57 s). The LCP element is a text node already in the server-rendered HTML, so what is left is react-dom and Next (about 100 KB gzip) downloaded and hydrated under the simulated 4x CPU / slow 4G. Lighthouse's own main-thread work is now 0.6 s (it was 3.2 s). Next candidates: take TanStack Query off the first-load path (about 6 KB gzip; the dataset could arrive as a plain prop), split the executive and analyst compositions into separate chunks, and measure with real brotli on the deployed site. Field Core Web Vitals are reported by the `web-vitals` adapter (see F09) and would be the real proof; the lab numbers are from one machine.
