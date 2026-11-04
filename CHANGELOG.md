# Changelog of starter adaptations

The supplied starter files under `data/starter/` are byte-identical to the pack (`pnpm verify:starter`). Changes live beside them.

- `src/features/assistant/server.ts`: adapted copy of `data/starter/reference/chat-route.ts` (kept untouched). Adds Zod input validation (400 on a missing, empty or over-long `question`), an abort-safe stream, error/abstain priority matching, and applies `data/overrides/fixtures.local.json` on top of the fixtures. The SSE protocol (`token`, `done`, `error`) is unchanged.
- `data/overrides/fixtures.local.json`: corrected answer text and citations for `at-risk`, `apac-vs-europe`, `forecast-miss`, `summary-long`, `germany-dip`. Reasons and figures: `docs/data-quality.md`. Fixture ids, keywords, kinds and confidence are unchanged.
- `/api/alerts`: mock endpoint added for the alert-rules form (700 ms latency, deterministic failure when the name contains "fail"). Stores nothing.
- `/api/telemetry`: no-op sink that re-applies the telemetry allowlist and answers 204.
