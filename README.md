# Market Operations Console

A streaming, evidence-citing assistant next to an analytical dashboard, over a synthetic market-operations dataset (13 markets, 24 months, May 2026 latest). Next.js 16 App Router, React 19, strict TypeScript.

Screenshots are in [`docs/screenshots/`](docs/screenshots) (1440 px and 390 px, both audiences, the assistant in its answer / streaming / abstain / error / evidence-drawer states, map, radar, heatmap, alert rules). They are regenerated with `SCREENSHOTS=1 pnpm e2e --grep "README screenshots"`.

![Analyst view](docs/screenshots/analyst-desktop.png)
![Assistant answer with citations](docs/screenshots/assistant-answer-desktop.png)

## What is verified and what is not

| Capability | Implemented | Locally verified | Deployment verified | Planned |
|---|---|---|---|---|
| Streaming chat: Stop, retry, stale-event guard, partial/incomplete/error states | yes | unit + e2e (controlled streams) | `curl -N` on production shows token frames ~35 ms apart | resumable streams (needs a real backend) |
| Trust surface: confidence, abstain, citations, evidence drawer, AI-vs-dataset labelling | yes | unit + e2e + axe | root and API respond on production | sentence-level citations (the contract only has answer-level) |
| Dashboard: portfolio, explorer, executive/analyst modes, map, radar comparison, heatmap | yes | unit + e2e + axe | root 200 on production | virtualised table (13 rows do not need it) |
| Alert rules form with optimistic save and rollback | yes | unit + e2e | not exercised on production | server persistence |
| Error boundaries, allowlisted telemetry, CSP, security headers | yes | unit + e2e (CSP violations checked on a full journey) | headers are set by `next.config.ts`, not separately inspected on production | a real RUM vendor behind `/api/telemetry` |
| Performance | bundle budget, Lighthouse | `docs/performance.md` | not measured on production | field Core Web Vitals |
| CI | yes | green on `main` | n/a | preview-deploy smoke test in CI |

"Deployment verified" only covers what I actually ran against production: the root page returns 200 and `/api/chat` streams incrementally (checked through `vercel curl`). The Playwright suite runs against a local production build, not against the deployed URL.

**Deployment access:** the Vercel project has Vercel Authentication switched on, so anonymous visitors are asked to log in. I did not change that setting; it is an account security decision (Project → Settings → Deployment Protection).

## a. Quick setup

Requires Node 22 and pnpm 10.

```bash
pnpm install --frozen-lockfile
pnpm dev            # http://localhost:3000
pnpm check          # starter hashes, contrast, typecheck, lint, module boundaries, unit tests, production build
pnpm verify:server-only   # proves a client import of server code fails the build
pnpm e2e            # Playwright: builds, serves, runs desktop + mobile projects
pnpm bundle         # first-load JS size (writes docs/performance/bundle.json)
```

No environment variables are needed. `TELEMETRY_LOG=1` makes `/api/telemetry` log sanitised events to the server console.

State of the checks when this was written: 455 unit/component tests, 118 e2e passed (34 skipped by design: desktop-only or mobile-only variants), dependency-cruiser clean, typecheck and lint clean.

## b. Architecture overview

```mermaid
flowchart TD
  P[app/page.tsx server component] -->|loads and validates dataset| H[Dataset hydrated into TanStack Query cache]
  URL[URL search params] <-->|typed adapter: parse, normalise, serialise| D[app/_components/dashboard.tsx composition root]
  H --> D
  D --> F1[features/portfolio-overview, executive-summary]
  D --> F2[features/market-explorer, market-map, market-comparison, risk-heatmap]
  D --> F3[features/alert-rules]
  D --> F4[features/assistant]
  F1 & F2 & F3 & F4 --> DOM[domains/market: schemas and pure selectors]
  F1 & F2 & F3 & F4 --> SH[shared: ui, lib, observability]
  F4 -->|POST fetch, SSE| API[/api/chat route -> assistant/server.ts/]
  F3 -->|POST| API2[/api/alerts mock/]
```

Layers, enforced by dependency-cruiser in `pnpm check` and CI (with fixture-based self-tests so the rules themselves are tested):

- `shared/` knows nothing about the business: UI primitives, formatting, telemetry.
- `domains/market/` is pure: Zod schemas, derived metrics (growth, forecast attainment, share), scope and view-state parsing, evidence resolution, alert evaluation. No React, no I/O.
- `features/*` are capabilities. A feature never imports another feature; each exposes a small public entry (`index.ts`, `client.ts`, `server.ts`).
- `app/` composes: it wires features to the URL and to each other through typed callbacks. A citation click in the assistant is turned into a URL change here; the assistant does not know the explorer exists.

**Server vs client state.**

| State | Owner | Why |
|---|---|---|
| Market dataset | Server component loads and validates it; hydrated into the TanStack Query cache | One fetch, one validated object, no per-chart fetching |
| Drill path, period, selected market, comparison set, audience mode | The URL | Shareable, reload-safe, back/forward works |
| Chat lifecycle (connecting, streaming, complete, stopped, incomplete, error) | `useReducer` in the assistant feature | Ephemeral, belongs to one surface |
| Alert rules | TanStack Query mutations (optimistic) over a mock endpoint, confirmed rules persisted to `localStorage` | The brief asks for an optimistic-save pattern with rollback |
| Form drafts | React Hook Form | Local to the form |

The chat route is the supplied starter route, adapted: input validation (400), abort-safe stream, fixture matching, and documented corrections to canned answers whose claims the data contradicts (see [`docs/data-quality.md`](docs/data-quality.md)). The original is kept untouched at `data/starter/reference/chat-route.ts`.

## c. Productionising it

Everything listed here exists in the repo.

- **Performance budget.** First-load JavaScript is measured by `pnpm bundle` and recorded in [`docs/performance.md`](docs/performance.md): 791.3 KB raw, 240.9 KB gzip, 209.7 KB brotli against an internal budget of 300 KB gzip. Analyst-only surfaces (heatmap, comparison, alert rules with the form library), the map with its geometry, and Recharts are lazy chunks. Token updates are batched per animation frame so streaming does not re-render the dashboard per token.
- **Core Web Vitals.** Measured, not claimed: see "Measured" below. The `web-vitals` adapter reports CLS, INP, LCP, FCP and TTFB through the telemetry pipeline.
- **Observability.** `shared/observability` builds events from an allowlist of keys and code-shaped values, so free text (a question, an answer, an error message) cannot be sent even by mistake. Sources: assistant stream outcome (timings, retries, terminal state, classified error code), web-vitals, render errors. Sink: console in development, a beacon to `/api/telemetry` in production. That route re-applies the allowlist, stores nothing and always answers 204; it is the place a RUM vendor would plug in. Tests assert with sentinel strings that no question, answer or citation text leaves the app.
- **Resilience.** One error boundary per surface. Chart failures fall back to the same data as a table, with "Try again". A failed lazy chunk is retryable (`React.lazy` caches a rejection for good, so retry builds a fresh lazy component). The assistant keeps working when the map is down, and the reverse. The stream has bounded retry (max 2, 500 ms then 1 s plus jitter, honouring `Retry-After` within a 90 s budget), 15 s first-event and idle timeouts, and Stop cancels pending backoff.
- **Safely rendering model output.** Assistant text is rendered as text, never as HTML. Citations are validated against the dataset; an unknown id is shown as unresolved.
- **Hardening.** `next.config.ts` sets a same-origin CSP (`default-src 'self'`, `connect-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, no third-party origin), nosniff, frame denial, referrer and permissions policies, COOP, and HSTS in production. Known limits: `script-src` needs `'unsafe-inline'` for Next's hydration scripts (a per-request nonce needs middleware and would make every page dynamic), and `'unsafe-eval'` is development-only. Zod runs in `jitless` mode so its eval probe does not trip the CSP.
- **Build, serve, cache.** `next build` with static assets served by Vercel's CDN under content-hashed paths; the page is a server component that renders the first view; `/api/chat` is a streaming route handler. The CSP and headers are applied to every route.
- **CI/CD.** `.github/workflows/ci.yml` runs install → `pnpm check` → server-only proof → Playwright. Vercel deploys every push to `main`.

### Measured

Lighthouse 12.8.2, headless Chrome on one Windows 11 desktop, against a local `next start` production build, simulated throttling, one run each:

| Preset | Perf | A11y | Best practices | SEO | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|
| Desktop | 100 | 100 | 100 | 100 | 0.3 s | 0.6 s | 0 ms | 0 |
| Mobile (4x CPU, slow 4G) | 81 | 100 | 100 | 100 | 0.9 s | **4.2 s** | 260 ms | 0 |

The simulated-mobile LCP is over the 2.5 s target and I have not fixed it. The LCP element is server-rendered text, so the delay is hydrating about 240 KB gzip of first-load JS under a 4x CPU slowdown, not a late resource. These are lab numbers from one machine and one run, not field data, and I do not claim a Core Web Vitals pass. The next steps are listed in [`docs/performance.md`](docs/performance.md).

## d. Front-end approach and decisions

> Sections d to j carry a factual basis from the implementation. Where it is a personal judgment, the marker below says so.

<!-- ANTON: rewrite in your own words -->
**Framework.** Next.js App Router. Basis: server component loads and validates the dataset, streaming route handler lives beside the UI, one deployable artifact on Vercel. Considered: Remix and TanStack Start (comparable; I would not get anything here that the App Router does not give me), plain Vite SPA (no server for the chat route and no server-rendered first view).

<!-- ANTON: rewrite in your own words -->
**Design tokens and components.** Tailwind 4 over CSS custom properties in `src/shared/styles/tokens.css`; components read variables, never literals. No component library: the surfaces here (dense tables, a heatmap grid, a drawer) are specific enough that a library would be overridden more than used, and the primitives are few. `pnpm verify:contrast` computes contrast ratios from the real token values and fails the build under WCAG thresholds ([`docs/design.md`](docs/design.md)). Trade-off: I own the focus handling and dialog behaviour, which is why they are tested.

<!-- ANTON: rewrite in your own words -->
**Streaming approach.** Native `fetch` POST plus `eventsource-parser` (`EventSourceParserStream`), events parsed by a Zod discriminated union, lifecycle in a reducer. Basis: the protocol is fixed and tiny (`token`, `done`, `error`, in `data/starter/CONTRACT.md`), and the points under evaluation (frames split across chunks, UTF-8 split across chunks, Stop, stale events, retry semantics, metadata only on `done`) are the thing a wrapper would hide. Considered the Vercel AI SDK with a custom `ChatTransport`: that adapter is the same parsing and lifecycle work behind another abstraction, and `citations` and `confidence` would become custom data parts. The OpenAI SDK is a provider client and there is no model here. With a real model and resumable streams I would adopt the AI SDK. Details: each attempt has an id and events from older attempts are dropped; tokens are applied per animation frame; confidence and citations are accepted only on `done`; reconnecting is a new attempt, not a resume.

<!-- ANTON: rewrite in your own words -->
**Making AI output trustworthy.** A citation is a pointer into the dataset: it opens a drawer with the exact series values and the supplied snapshot, with provenance and a jump that sets the dashboard URL to the same market and period. Confidence is shown as text plus icon plus a sentence about what it means for this answer, only after `done`; after Stop it is marked unavailable. Low confidence and abstention have their own copy, distinct from transport errors. AI text lives in its own panel with an "AI-generated" label and its own surface tokens; dashboard values carry "Source: dataset" and never use the assistant's styling. Where a canned answer contradicts the dataset (five of them do) I wrote an override and documented it instead of bending the data ([`docs/data-quality.md`](docs/data-quality.md)).

<!-- ANTON: rewrite in your own words -->
**Data visualisation.** Recharts for the time series and the radar (declarative, accessible-enough SVG, tree-shakeable); `react-simple-maps` with world-atlas TopoJSON for the choropleth (geometry copied into the feature, lazy, no network fetch); the heatmap is a real HTML grid because it is 13 × 24 numbers that deserve keyboard navigation and exact labels, not a canvas. The radar normalises explicitly and shows raw values beside it, and a missing value is never plotted as 0. Every chart has a text summary and a table of the same rows, and colour is paired with text, an icon or a texture.

<!-- ANTON: rewrite in your own words -->
**Client and server state, URL state.** TanStack Query for the dataset and the mutations, reducers for ephemeral state, no global store (nothing needed one). The URL is the single source of truth for view state: one typed adapter drops unknown ids, enforces dependencies, serialises canonically, pushes discrete selections to history and replaces normalisations. Features receive typed props and callbacks from `app/`.

<!-- ANTON: rewrite in your own words -->
**Forms and validation.** React Hook Form with `zodResolver` over the same Zod schema the server validates against (`domains/market/alerts.ts`): the threshold must be a finite number (empty is an error, never 0), with explicit bounds per metric. The form previews which markets a rule would flag before it is saved. Saving is optimistic and rolls back when the mock server rejects: any rule whose name contains "fail" is rejected deterministically (a documented QA trigger shown in the UI). Rules are stored in this browser only (`localStorage`), because a process-global array on the server would not survive a serverless deployment.

## e. Accessibility (WCAG 2.1 AA)

Covered, with the test that checks it:

- Keyboard: roving tabindex in the heatmap grid and map table, arrow keys in the grid without swallowing browser shortcuts, a skip link, focus moved to the first invalid field, focus restored after "Try again" and after closing the drawer (e2e).
- Screen readers: landmarks and headings, `aria-sort` on sortable headers, one polite live announcement when an answer finishes rather than one per token, status and alert regions for save and error states (component + e2e).
- Modal assistant drawer on small screens: native `<dialog>` for evidence, `inert` page plus scroll lock, Escape closes the top layer only (e2e).
- Colour and contrast: token pairs checked by `pnpm verify:contrast` (4.5:1 text, 3:1 UI and focus); status is never colour alone (icon, text label, textures on the map); two-tone focus ring; forced-colors support.
- Charts: summary text and a data table for each chart, including the table fallback when a chart fails.
- Reduced motion: global CSS rule plus Recharts animation off; asserted for the radar polygon and the line, with a control run proving the probe can detect animation.
- axe-core runs in Playwright on the main views, with the assistant open, with errors showing, and on the 404 page.

Gaps: no manual screen-reader pass (NVDA/VoiceOver) — only automated axe and assertions on roles and names; no zoom-to-400% or text-spacing audit; light theme only; the map's country shapes are not individually navigable on touch beyond the table alternative.

## f. Testing

- **Unit (Vitest):** domain selectors (metrics, scope, view state, alert evaluation, rounding, comparison, heatmap), recomputed independently from the dataset where a number is asserted, the stream parser and reducer with chunk-boundary and UTF-8 splits, the telemetry allowlist, overrides recomputed from the data.
- **Component (Testing Library):** every feature, including failure paths (map/trend/radar throwing, lazy chunk rejecting), optimistic save and rollback, focus management.
- **End-to-end (Playwright, desktop and mobile):** the happy path, Stop, retry, abstain, error, stale attempts via controlled streams, URL round-trips, keyboard journeys, chunk failures, CSP violations on a full journey, telemetry content, axe on key views.
- **Architecture tests:** module boundaries with fixtures; server-only proof; starter files byte-checked against the supplied pack.
- **Skipped on purpose:** visual regression snapshots (screenshots are generated for review, not compared), cross-browser matrix (Chromium only), load testing, and tests against the deployed URL in CI.

## g. Key technical decisions

1. Own the stream transport instead of an SDK (section d).
2. URL as the only owner of view state; features never import each other.
3. Pure domain layer shared by the dashboard, the assistant overrides, the evidence drawer and the alert evaluation, so one number cannot differ between surfaces.
4. Derive growth and attainment from summed amounts for regions and the portfolio, never by averaging market percentages.
5. Show supplied statuses as supplied and label them, even where they disagree with derived attainment (Spain), instead of recomputing to make them agree.
6. Allowlisted telemetry that cannot carry free text.
7. Zod in `jitless` mode via a side-effect module imported first, found necessary by a CSP test and then re-measured so it did not cost bundle size.

## h. Engineering standards: followed and skipped

Followed: strict TypeScript (`noUncheckedIndexedAccess`, no `any`, no non-null assertions), typed contract end to end (dataset, SSE events, URL state, forms), enforced module boundaries, small public APIs, per-feature records in [`docs/engineering/features/`](docs/engineering/features), tests that were mutation-checked where they guard a bug, conventional commits, CI on every push.

Skipped or only partly done: no ADR folder (decisions are in the feature records), no Storybook, no bundle-size check in CI (the script exists, the gate does not), no dark theme, no i18n, no server persistence, Node 22 is required but pnpm scripts on my machine ran under Node 20.

## i. How I used AI tools

<!-- ANTON: rewrite in your own words -->
Basis from how this repo was actually built: I wrote a plan first (phases P0 to P10, each with acceptance criteria and gates) and then had Claude Code implement it phase by phase in one repository. Each phase went through the same gates: typecheck, lint, boundaries, unit tests, build, e2e, a check of the running app in a browser, then one read-only reviewer subagent with a fixed template and a JSON verdict (defects versus incompletes), then a commit. Review verdicts came back failing on most phases and the defects were fixed before moving on; they are listed in the feature records and `docs/engineering/STATUS.md`. Rules for the agent live in `AGENTS.md` and `docs/engineering/` so the standard is written down rather than remembered. What the agent was not allowed to do: weaken a check to get green, flip the repo to public, send email, add stretch goals early, or run parallel implementation agents.

<!-- ANTON: rewrite in your own words -->
Where I did not trust generated output: the canned assistant answers (checked against the data and corrected), numbers in tests (recomputed independently rather than copied from the implementation), and this README's judgment sections, which need my own words.

## j. What I would do with more time

- Fix the mobile LCP: render the health strip as a Server Component, hydrate only what the visible surfaces need, drop react-query and zod from the first load, and cut the roughly 135 KiB of unused JS Lighthouse reports.
- Real RUM behind `/api/telemetry` and error tracking with source maps; field Core Web Vitals instead of lab numbers.
- A manual screen-reader pass and a 400% zoom audit; a dark theme.
- Run the Playwright happy path and a Stop test against each preview deployment in CI; add the bundle budget as a CI gate.
- Server persistence for alert rules and a real notification path.
- Sentence-level citations if the contract grows to carry them; resumable streams with a real backend.
- Not built (stretch goals): selection-aware suggested prompts and a command palette.

## k. A note on the writing

The assignment asks for my thoughts rather than generated text. The implementation facts above are checked against the repo; the paragraphs marked `<!-- ANTON: rewrite in your own words -->` are first drafts to be replaced with my own reasoning before submission.

## Attributions

Country geometry: [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth, public domain). Starter data, fixtures, contract and reference route: the supplied starter pack, kept byte-identical in `data/starter/`.
