# F00 — Runnable foundation та правила меж

> Starter baseline correction (2026-11-03): build on the supplied starter, verified identical to the email ZIP. Read STARTER-BASELINE.md in the planning package (or docs/engineering/STARTER-BASELINE.md in agent-kit). F00 must preserve/import the supplied assets and connect/smoke-test reference/chat-route.ts with fixtures.json; F03 adds the chat surface and hardens that existing route. This explicit reuse requirement takes precedence over older wording about a shell-only foundation or a greenfield build.

Status: implemented (see Evidence).

## Outcome і scope

Результат: наступний агент може запустити застосунок із clean checkout, перевірити його та додати першу бізнес-feature за явними module rules.

In scope: Next.js/React/TypeScript toolchain, мінімальний application shell, CSS tokens, лише потрібні UI primitives, automated import/cycle checks, CI smoke, repo instructions; import original data/fixtures and connect the supplied reference/chat-route.ts through a thin /api/chat wrapper with a protocol smoke test.

Out of scope: portfolio data model, chat UI and resilience hardening, map, radar, heatmap, alerts, повні product-specific stores/adapters. Вони приходять у F01–F08. The starter route baseline above is explicitly part of F00.

Source requirements: original brief tech stack/testing/engineering standards; AGENTS.md; engineering ARCHITECTURE.md та DELIVERY.md.

Dependencies: agent-kit підготовлено; actual repo/environment ще потрібно визначити.

## Architecture contract

Owner: основний implementation agent.
Owned paths: scaffold/package/lockfile/config/CI, src/app shell, використані src/shared primitives, docs/engineering.
Public API: тільки мінімальні UI primitives та tokens, які вже використовуються shell.
Runtime: server root/layout, client components лише там, де є interaction; server/client imports не змішані.
State: локальне UI state, якщо необхідне для shell; remote state provider не додавати без consumer.

## Acceptance examples

- Clean install із зафіксованого lockfile запускає app; основний route показує semantic page shell без runtime errors.
- Imported starter assets match their originals; POST /api/chat with a supplied fixture question emits the original token/done event contract. Preserve the original reference source and document necessary integration adaptations.
- Typecheck, lint, production build і startup/browser smoke проходять.
- У temporary test fixtures public app → feature entry дозволений; sibling feature import, shared → feature, domain → framework і cycle відхиляються.
- Public client entry не може протягнути server-only implementation у client bundle.
- CI виконує потрібні checks; наведені commands відповідають реальному package.json.
- Немає порожніх directories і stubs для всіх майбутніх business features.
- Keyboard focus, heading structure та responsive shell перевірені; controls, яких ще немає, не імітують готові фічі.

## План

1. Inspect checkout, authorization, current instructions та Git state. Визначити project root, перевірити runtime/tools.
2. Перенести/merge agent-kit; налаштувати scaffold і мінімальні scripts. Import starter assets, wire the supplied mock route and verify its streaming contract before business UI work.
3. Додати tokens та semantic shell із потрібними primitives.
4. Налаштувати module-boundary/cycle analyzer за ARCHITECTURE.md; перевірити allow/deny cases.
5. Підключити CI, startup smoke та production build; виправити помилки.
6. Review actual diff, stage лише F00 scope, створити foundation commit.
7. Оновити STATUS; наступна feature F01 portfolio health.

Expected commits: optional `docs(engineering): define architecture and feature delivery rules`, потім `chore(foundation): add runnable shell and boundary checks`. Не комітити fake feature implementations для створення видимості готового продукту.

## Evidence (P0, 2026-11-03)

Status: implemented, locally verified. CI and Vercel preview results are recorded in STATUS.md once the first push completes.

- `pnpm check` green: starter SHA-256 x5 match, contrast table 16/16 pass, `tsc --noEmit` (TypeScript 5.9.3, strict + noUncheckedIndexedAccess), ESLint (no `any`, no non-null `!`, no `dangerouslySetInnerHTML`), dependency-cruiser, Vitest 13 tests, `next build`.
- Boundary rules are real: `tests/boundaries/` holds ten fixture trees; `tests/unit/boundaries.test.ts` runs the same `.dependency-cruiser.cjs` over each and asserts shared->feature, domain->react, sibling feature (relative, `@/` alias, re-export, static dynamic import), app->private file, cycle and client->server fail, while app->public entry, feature->domain and domain->shared pass.
- `server-only` leakage: a temporary `"use client"` route importing `features/assistant/server` failed `next build` (exit 1, "importing a module that depends on server-only"); the fixture was deleted.
- Route: `POST /api/chat` local `curl -N` shows token frames spread over ~3.4 s then `done` (`kind:normal`, `confidence:high`). Playwright asserts >5 chunks arriving >500 ms apart.
- E2E: shell test (one h1, main landmark, skip link focus, axe wcag2a/2aa/21aa clean, zero console errors) and stream test pass at 1440x900 and 390x844.
- Screenshots: `docs/evidence/P0/`.

Adaptations to the starter handler (original preserved at `data/starter/reference/chat-route.ts`): fixtures import path, `import "server-only"`, handler moved to `src/features/assistant/server.ts` behind a thin route file. Protocol and behaviour unchanged; hardening is P3.
