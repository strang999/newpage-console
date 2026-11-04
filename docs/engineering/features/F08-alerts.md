# F08 - Alert rules with optimistic save

Status: implemented, locally verified (P8, 2026-11-04).

## Outcome

An analyst defines threshold rules ("flag any market whose growth / forecast attainment is below X%"), sees the affected markets for the latest period before saving, and saves with an optimistic update that rolls back deterministically when the (mock) server rejects it. Rules live in this browser only.

## Contracts

- `domains/market/alerts.ts` (pure): `alertRuleInputSchema` (name 2-60 trimmed; scope all/selected with >=1 market when selected; metric growth|attainment; **finite numeric threshold: empty/NaN is an error, never 0**; explicit bounds growth -50..100, attainment 50..150; enabled), `evaluateRule` ("below" is strict and uses the displayed one-decimal value, so a market at exactly the threshold is not flagged; a market with no value is never flagged), `unknownMarketIds`.
- Form: React Hook Form + `zodResolver` over the domain schema; inline errors with `aria-invalid` + `aria-describedby`; focus moves to the first invalid field; live preview ("Would flag 3 of 13 markets: Germany 92.2%, ...").
- Endpoint `POST /api/alerts` (thin route -> `features/alert-rules/server.ts`, `server-only`): validates `{op: create|toggle|delete, rule}` with the shared schema and known market ids, waits 700 ms, and **fails with 500 when the rule name contains "fail"** (documented QA trigger, shown in the UI). Stores nothing: a process-global array would not survive a serverless deployment.
- Persistence: `repository.ts` writes confirmed rules to `localStorage` (validated on read; corrupt values ignored; storage errors surface as a failed save). The UI labels it "Saved in this browser only".
- Optimistic pattern (TanStack Query `useMutation`, `retry: false`): `onMutate` snapshots the cache and applies the change (rule shown as "Saving…"); `mutationFn` calls the endpoint and only then commits to storage; `onError` restores the snapshot and shows an alert "Couldn't save ... Your draft is kept." with Retry / Dismiss; the form is reset only after a confirmed save. Controls (save, switch, delete) are disabled while a write is in flight, so a rollback can never overwrite another pending change. Toggle and delete follow the same pattern and undo themselves on failure.

## Defects found by tests and fixed

- Delete button accessible name was "DeleteEurope watch" (visually hidden span with no separating space); now an explicit `aria-label` that starts with the visible text.

## Evidence

- 25 domain tests (schema errors, empty threshold, every bound edge, selected scope, evaluation vs the data incl. strictness and null), 24 feature unit tests (pure `applyOperation`, repository incl. corrupt/blocked/full storage, endpoint: latency, deterministic failure for all ops, 400s, no state), 20 component tests (validation + focus, preview, optimistic insert before the response, commit-only-after-confirm, rollback with draft intact and storage unchanged, retry, network error, storage failure, toggle/delete optimistic and undone, disabled while in flight, reload keeps only committed).
- Playwright desktop + mobile against the real endpoint: pending row visible during the latency, confirmed, survives a reload; "fail rule" appears then disappears, alert + draft + Retry (fails again, deterministic), a corrected name then saves; empty threshold blocks with no request; selected-markets flow; toggle/delete persistence; axe clean with errors and alert showing; phone layout and Enter-to-submit. Screenshots `docs/evidence/P8/`.

## Limits

Rules are evaluated for display only (no notifications). Alerts appear in the analyst audience only. localStorage is per browser profile.
