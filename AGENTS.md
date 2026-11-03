# Agent delivery rules

> Starter baseline correction (2026-11-03): build on the supplied starter, verified identical to the email ZIP. Read STARTER-BASELINE.md in the planning package (or docs/engineering/STARTER-BASELINE.md in agent-kit). F00 must preserve/import the supplied assets and connect/smoke-test reference/chat-route.ts with fixtures.json; F03 adds the chat surface and hardens that existing route. This explicit reuse requirement takes precedence over older wording about a shell-only foundation or a greenfield build.

These rules govern implementation in this repository. Preserve Anton's explicit choices and continue authorized work without routine approval loops. Keep updates direct and distinguish verified facts from proposals.

## Start here

1. Read `docs/engineering/ARCHITECTURE.md` and `docs/engineering/DELIVERY.md`.
2. Read `docs/engineering/PROJECT.md` for project-specific constraints and the current feature sequence.
3. Read `docs/engineering/STATUS.md`, inspect Git status/diff, and identify the next unfinished feature.
4. Load only relevant available skills using `docs/engineering/TOOLS.md`. The repository workflow works without optional plugins.

## Architecture

- Establish a small runnable foundation before implementing business features. Add feature-specific abstractions when their feature arrives.
- `shared` is business-agnostic; `domains` contains pure business contracts and calculations; `features` owns complete user capabilities; `app` composes them.
- Features must not import sibling features. Compose them in `app` using typed props, callbacks and domain contracts. No global event bus by default.
- External consumers use public module entry points. Keep browser and server entry points separate; do not re-export server modules through client barrels.
- Keep feature UI, behavior, adapters and relevant tests together. Shared code is extracted for demonstrated reuse or an actual domain invariant, not a hypothetical future consumer.
- No single global store, catch-all service, or page component owns every feature's behavior. Place state with its actual owner.
- Keep framework route files thin. A route handler delegates feature logic to that feature's server entry point.
- Enforce import boundaries and cycles in the foundation CI. Until checks are actually wired and tested, report this as a planned rule, not enforced protection.

## Feature delivery

- One active feature at a time by default. Finish its integration and checks before starting another.
- Before coding, create a short feature record from `docs/engineering/templates/FEATURE.md`: user outcome, scope, contracts, dependencies, checks and commit scope. Do not await permission for ordinary implementation choices already authorized.
- Implement a vertical slice: observable behavior, relevant domain/adapters, UI, meaningful verification and integration in the same delivery unit.
- For risky logic or bug fixes, reproduce behavior with a focused failing test before the fix. Do not add tests that merely repeat implementation or test trivial styling.
- Cover relevant empty/loading/error/partial states, accessibility and cancellation alongside the feature, not as a final cleanup phase.
- Review the complete diff and test evidence, fix defects, then commit that feature. Do not mark it done because files exist.
- If required checks cannot run, record exactly why and what remains unverified. Do not waive or hide the gap.

## Git

- Use the existing authorized task branch/worktree when suitable. Inspect current history and uncommitted changes before editing or committing.
- Commit completed features separately with `feat(scope): user-visible outcome`; use `fix`, `refactor`, `test`, `docs` and `chore` for their actual purpose.
- Each commit has one coherent purpose and includes its relevant tests/docs. Larger features may have several buildable commits with the same feature scope.
- Stage explicit paths/hunks; inspect staged diff. Preserve unrelated user changes. Do not use `git add .` blindly.
- Do not fabricate incremental history after implementing the whole application. Do not squash the entire project into one feature commit.
- Do not rewrite existing shared history, invent a Git identity, push or publish unless authorized. Local feature commits are the intended implementation workflow.

## Handoff and skills

- `STATUS.md` is the compact resume point. Record completed feature IDs, actual commits, checks and next step; never fabricate outcomes or hashes.
- Record architectural decisions only when they change module boundaries, public contracts, persistence, dependencies or deployment shape.
- Skills supply task-specific guidance; examples are not copy-ready code. Check installed versions and project requirements.
- Parallel agents are optional only when authorized; one coordinator owns shared contracts and integration. Each worker gets a bounded feature, file ownership and acceptance criteria.
- Final reports state what changed, why, what passed, limitations and the next feature. Do not equate a written policy with an implemented check.

## Project commands and paths (this repository)

- Install `pnpm install --frozen-lockfile`; full gate `pnpm check`; browser tests `pnpm e2e`.
- Supplied starter assets: `data/starter/` (never edit; `pnpm verify:starter` checks SHA-256). Original reference route: `data/starter/reference/chat-route.ts`.
- Mock chat handler (adapted copy): `src/features/assistant/server.ts`; route wrapper `src/app/api/chat/route.ts`.
- Design tokens and contrast: `src/shared/styles/tokens.css`, `docs/design.md`.
- Execution order and gates: the planning package's `PLAN-STRICT.md` (phases P0-P10 map to F00-F09/R01). Evidence goes into `docs/engineering/STATUS.md`.
- Boundary rules: `.dependency-cruiser.cjs`; their self-tests: `tests/boundaries/` + `tests/unit/boundaries.test.ts`.
