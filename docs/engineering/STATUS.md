# Resume state

Updated: 2026-11-03 (Asia/Bangkok). Execution plan: planning package `PLAN-STRICT.md` (P0-P10).

## Phase ledger

| Phase | State | Evidence |
|---|---|---|
| P0 / F00 foundation | done. CI green (run 41619038215), Vercel deployment Ready, host streaming verified incrementally (tokens over ~3 s via `vercel curl`), root 200. Independent review FAIL -> 3 defects + 2 incompletes fixed (regex escaping in depcruise config, forced-colors focus ring, server-only build proof as `pnpm verify:server-only`) | `features/F00-foundation.md` |
| P1 / F01 portfolio | done: review PASS, commit 350e7da, CI run 41620554596 green | `features/F01-portfolio.md` |
| P2 / F02 explorer | done: review FAIL -> stale-closure defect in `useViewState` + 2 test gaps fixed (pending-URL ref, hook tests, exact table values); commit f37807d | `features/F02-explorer.md` |
| P3a assistant transport + lifecycle | committed b3e6d77 (130 tests, e2e 20 pass locally). P3 review is run once over all three P3 commits after 3c | below |
| P3b resilience | implemented, locally verified (159 unit/component tests; e2e 24 pass on clean runs) | below |
| P3c trust UI + single P3 review | review FAIL (4 defects, 2 incompletes) -> fixed: unsupported causal claim in the unchanged germany-dip fixture (now an override), duplicate error announcement, DEFAULT_POLICY untested, override figures not anchored per entity, hook unmount/flush and retry edge cases untested. 204 tests, e2e 27 pass | `docs/data-quality.md` |

| P4 / F04 map | implemented, locally verified; review pending | `features/F04-map.md` |

## Next concrete step

P5 comparison radar, P6 heatmap, P7 executive/analyst (+ layout and visual polish pass), P8 alerts, P9 hardening, P10 release.

## Known gaps / limitations

- Local e2e flake source: running `pnpm e2e` twice back to back on Windows can rebuild `.next` under the previous run's still-running server (mass failures at 0 ms). Not an app defect; CI runs once on a clean checkout. Hydration races are handled by `gotoReady` (waits for `data-hydrated`).
- Automatic retries reuse the attempt id (nothing has been received yet, so there is nothing stale); manual retries get a new attempt id and archive the partial text.

- pnpm scripts on this machine run under Node 20.18.2 (engines warning); Node 22 is used by CI. Not blocking.
- Light theme only.
- Vercel Authentication (deployment protection) is ON for the project, so deployments need a bypass for anonymous visitors. It must be switched off (or the production domain made public) before submission; decision belongs to Anton, raised in P10.
- Git-connected Vercel project deploys every push to `main` as Production automatically.

## Commit ledger

- 57b8cd7 docs(engineering): define architecture and delivery rules
- 73faabe chore(foundation): runnable shell, starter route, boundary checks, CI
- 350e7da feat(portfolio): show verified portfolio health and market table
- f37807d feat(explorer): add shareable market and product navigation with trend chart
- b3e6d77 feat(assistant): stream fixture answers with stop and lifecycle states
