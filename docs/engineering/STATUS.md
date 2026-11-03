# Resume state

Updated: 2026-11-03 (Asia/Bangkok). Execution plan: planning package `PLAN-STRICT.md` (P0-P10).

## Phase ledger

| Phase | State | Evidence |
|---|---|---|
| P0 / F00 foundation | done. CI green (run 41619038215), Vercel deployment Ready, host streaming verified incrementally (tokens over ~3 s via `vercel curl`), root 200. Independent review FAIL -> 3 defects + 2 incompletes fixed (regex escaping in depcruise config, forced-colors focus ring, server-only build proof as `pnpm verify:server-only`) | `features/F00-foundation.md` |
| P1 / F01 portfolio | implemented, locally verified; review + push pending | `features/F01-portfolio.md` |

## Next concrete step

Finish P1 gates (review, commit, push, preview), then P2 explorer + URL state.

## Known gaps / limitations

- pnpm scripts on this machine run under Node 20.18.2 (engines warning); Node 22 is used by CI. Not blocking.
- Light theme only.
- Vercel Authentication (deployment protection) is ON for the project, so deployments need a bypass for anonymous visitors. It must be switched off (or the production domain made public) before submission; decision belongs to Anton, raised in P10.
- Git-connected Vercel project deploys every push to `main` as Production automatically.

## Commit ledger

- 57b8cd7 docs(engineering): define architecture and delivery rules
- 73faabe chore(foundation): runnable shell, starter route, boundary checks, CI
