# F09 - Observability, resilience and hardening

Status: implemented, locally verified (P9, 2026-11-04).

## Outcome

Failures are contained to the surface that failed, operational facts are collected without any user content, the app ships a strict same-origin CSP, and the first-load JavaScript is measured and budgeted.

## What is wired

- **Error boundaries** (`shared/ui/error-boundary.tsx`): one per surface. Trend chart, map and radar fall back to the *same data as a table* (plus an alert and "Try again"); assistant, markets table, heatmap, comparison, alerts and top risks/movers each have a guard in `app/_components/dashboard.tsx`; `app/error.tsx` and `app/not-found.tsx` cover the route. The report carries only the surface name and a fixed code, never the error message or stack (they can contain user data). "Try again" works for a failed chunk load: `React.lazy` caches a rejection for good, so retry creates a fresh lazy component and re-renders its owner.
- **Telemetry** (`shared/observability`): events are built from an allowlist (`event, attemptId, durationMs, ttftMs, retryCount, terminalState, errorCode, surface, metric, value, rating, navigationType`); strings must look like codes (`[A-Za-z0-9_.:-]{1,40}`) so free text cannot ride in an allowed key; unknown events are dropped. Sources: assistant stream outcome (timings, retries, terminal state, classified error code), `web-vitals` (CLS, INP, LCP, FCP, TTFB), render errors. Sink: console in development; in production a beacon to `/api/telemetry`, a no-op route that re-applies the allowlist, stores nothing and always answers 204 (this is where a RUM vendor adapter would plug in). `TELEMETRY_LOG=1` logs the sanitised events server-side for demonstration.
- **Security headers and CSP** (`next.config.ts`): `default-src 'self'`, `connect-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `nosniff`, `X-Frame-Options: DENY`, strict referrer policy, restrictive `Permissions-Policy`, COOP, HSTS in production. No third-party origin appears anywhere. Known limit: `script-src` needs `'unsafe-inline'` for Next's hydration scripts (a per-request nonce needs middleware and would make every page dynamic); `'unsafe-eval'` is development-only. Model output is rendered as text, never as HTML.
- **No `eval` anywhere**: zod's JIT probe (`Function("")`) is reported by a strict CSP. `src/shared/lib/zod-config.ts` (side effect only: `config({ jitless: true })`) is imported FIRST by every file that imports zod, so the setting is in place before any schema is defined whatever order lazy chunks load in; `zod-config.test.ts` fails if a file imports zod without it. The first attempt re-exported `z` from a wrapper module: it worked, but the CSP e2e had already caught the ordering bug once, and the bundle script then showed the wrapper defeating tree-shaking (+59 KB gzip). The side-effect module costs nothing.
- **Performance**: analyst-only surfaces (heatmap, comparison, alert rules with the form library) are lazy chunks, so the executive first load does not download them; the map, its geometry and Recharts are lazy as well. Token updates are batched per animation frame, so streaming never re-renders the dashboard per token. See `docs/performance.md` for measured numbers.
- **Reduced motion**: global CSS rule plus chart animation switched off from `prefers-reduced-motion` (asserted for the trend line and the radar polygon).

## Defects found by tests and fixed

- Making the chart container `min-height` (so a fallback could grow) collapsed the chart's `height: 100%` to 0: the chart now keeps a definite-height wrapper inside the boundary.
- `React.lazy` retry did nothing (cached rejection, and the owner did not re-render): fresh lazy component plus a state bump.
- zod's eval probe under the CSP (above), and the bundle regression from the first fix (found by re-measuring, not assumed).
- Telemetry e2e: beacon bodies are not reliably visible from the `request` event; captured with a route instead.

## Evidence

- 8 observability tests (allowlist, code-shaped strings, non-finite numbers, unknown events, sink swap, sink that throws), 5 error-boundary tests (contains the failure, siblings alive, message never reported, retry, repeated failure), map and trend failure tests (fallback table, controls alive, only surface + code reported), 4 telemetry-route tests (always 204, re-applies allowlist, drops unknown/oversized, logs nothing by default).
- Playwright: a blocked map chunk leaves health, trend, risks, period picker and drill working with the table as the map, axe clean; Try again restores the map; the assistant works while the map is down; headers present and nothing third-party in the CSP; no CSP violation on a full journey; telemetry sent during a chat contains timings and a terminal state, no question/answer/citation text, only allowlisted keys, and no request leaves the origin; 404 page; reduced motion for radar and line.
