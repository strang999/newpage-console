# Market Operations Console

Front-end take-home: a streaming, evidence-citing assistant and an analytical dashboard over a synthetic market-operations dataset. Next.js App Router, strict TypeScript.

> Work in progress. The full README (setup, architecture, decisions, accessibility, testing, AI workflow) is written in the release phase. Until then this file lists only what exists.

## Setup

Requires Node 22 and pnpm 10.

```bash
pnpm install --frozen-lockfile
pnpm dev            # http://localhost:3000
pnpm check          # starter hashes, contrast, typecheck, lint, module boundaries, unit tests, production build
pnpm e2e            # Playwright (builds and serves the app first)
```

## What exists now

- App shell (semantic landmarks, skip link, design tokens).
- `POST /api/chat`: the supplied mock endpoint (token / done / error SSE, per `data/starter/CONTRACT.md`).
- Supplied starter assets under `data/starter/`, byte-checked by `pnpm verify:starter`.
- Enforced module boundaries (`dependency-cruiser`) with fixture-based self-tests, and CI.

Everything else is tracked in `docs/engineering/STATUS.md`.
