# Newpage — застосування загальних правил

> Starter baseline correction (2026-11-03): build on the supplied starter, verified identical to the email ZIP. Read STARTER-BASELINE.md in the planning package (or docs/engineering/STARTER-BASELINE.md in agent-kit). F00 must preserve/import the supplied assets and connect/smoke-test reference/chat-route.ts with fixtures.json; F03 adds the chat surface and hardens that existing route. This explicit reuse requirement takes precedence over older wording about a shell-only foundation or a greenfield build.

Цей документ містить тільки project-specific рішення. Загальні правила живуть в ARCHITECTURE.md і DELIVERY.md; вони придатні для інших застосунків.

## Контекст та джерела

Потрібен Market Operations Console із mock streaming assistant і dashboard. Source brief/starter pack та аудит лежать у зовнішньому пакеті `newpage-plan/sources/` і `newpage-plan/data-audit.json`. При створенні implementation repo агент має скопіювати потрібні source assets і записати їх актуальні paths у цьому документі. Доступ до Gmail не потрібен.

`newpage-plan/ARCHITECTURE-PLAN.md` зберігає продуктові вимоги, data decisions та деталі streaming. `newpage-plan/TASKS.md` містить старі engineering work packages T00–T12 для довідки. **Порядок виконання та структура модулів тепер визначаються цим agent-kit: F00 → F01 → … → release.** Не виконувати старий horizontal backlog як окремий конкурентний план.

## Зафіксовані constraints

- React 18+, strict TypeScript, Next.js App Router; власний typed SSE contract.
- Один app; feature modules із явними public boundaries.
- Supplied dataset і mock backend, без real LLM/RAG/auth/database.
- Canonical facts — числове джерело істини; snapshot status/share має явний scope.
- 13 markets × 5 products × 24 periods = 1 560 facts; horizon 2024-06…2026-05.
- Latest snapshot: 4 at-risk, 2 off-track. Latest actual $22,850,419; attainment ≈100.45%.
- Оригінальні fixtures зберегти; неточні narratives виправляти documented overrides без зміни protocol.
- Stop, citations, confidence, abstention, URL sharing/history, 4 charts, 2 audience modes, schema form + optimistic rollback, a11y та meaningful tests — required.
- Overview numerical selectors не можуть містити формули, які відрізняються від інших views.
- Browser-local alert persistence допустима для demo, але явно описана.

## Feature sequence та commits

| ID | User-visible outcome / результат | Що вводимо зараз | Commit scope | Старий backlog |
|---|---|---|---|---|
| F00 | Runnable application shell + supplied mock route | Repo instructions, starter assets/reference route, protocol smoke, tokens, providers лише за потреби, lint/typecheck/build, boundaries та CI smoke | foundation | T01; правила із цього kit |
| F01 | Користувач бачить перевірене portfolio health | Dataset validation, market domain, мінімальні aggregates, KPI/status counts, market table, source audit | portfolio | T00, потрібна частина T02/T04 |
| F02 | Користувач досліджує market/product/month і ділиться view | Explorer, breadcrumb, URL adapter, actual/forecast/priorYear chart, history tests | explorer | T03, решта T04 |
| F03 | Користувач отримує streaming answer і відкриває evidence | SSE schema/parser/route, chat reducer, Stop, trust UI, resolver, integration callbacks | assistant | T05; citation частина T02 |
| F04 | Користувач обирає країну на choropleth | Market map, ISO geometry, keyboard/table alternative, URL integration | map | T06 |
| F05 | Користувач порівнює markets або regions | Comparison selection, radar normalization, raw-value table | comparison | radar частина T07 |
| F06 | Користувач знаходить проблемний market/month | Heatmap, diverging scale, keyboard navigation, coordinated selection | heatmap | решта T07 |
| F07 | Користувач перемикає executive / analyst | Audience composition, compact health/top risks/movers, dense analyst layout, mode URL state | audience | T08 |
| F08 | Користувач налаштовує alert rule | Form schema, affected-market preview, mock save, optimistic rollback, browser persistence | alerts | T09 |
| F09 | Розробник діагностує client/stream failures | Мінімальні error/web-vitals/stream timing adapters, privacy-conscious payloads, production measurements | observability | відповідна частина T11 |
| R01 | Перевірений submission candidate | Full regression, deployed smoke якщо авторизовано, README/screenshots, final evidence | docs/release | T10–T12 фінальна перевірка |

Залежності послідовні за замовчуванням. Features F04–F08 технічно можуть бути незалежними після F02/F03, але це не привід запускати все одночасно. Архітектура дозволяє делегацію пізніше; історія доставки лишається зрозумілою.

**Тести, accessibility, error/empty/loading states, boundary checks — частина кожної F-feature.** R01 перевіряє інтеграцію і delivery, а не вперше додає якість. F09 додає спостережуваність; error handling уже має працювати з попередніх фіч.

F03 велика: її можна завершити кількома commits scope assistant, наприклад working mock stream → stop/retry/partial states → citations/trust integration, з buildable результатом у кожному. Наступна feature починається після виконання всіх F03 acceptance criteria. Не видавати перший stream commit за завершений assistant.

## Module ownership для цього проєкту

- `shared`: UI primitives, tokens, business-agnostic utilities. Не має market/chat/alert business types.
- `domains/market`: dataset contracts, pure aggregates, entity IDs, evidence target/value resolution. Чатова SSE schema не належить market domain.
- `features/portfolio-overview`: health and market summary surface.
- `features/market-explorer`: drill controls та historical trend.
- `features/assistant`: mock streaming API, fixture selection, transcript, evidence presentation.
- `features/market-map`: choropleth, географічні interactions.
- `features/market-comparison`: radar і comparison controls.
- `features/risk-heatmap`: historical attainment grid.
- `features/alert-rules`: form, save adapter, mutation state.
- Audience modes переважно `app` composition: це feature delivery unit, але не мусить мати окрему feature folder без власної поведінки.
- Observability generic adapter — shared; конкретні event calls — там, де поведінка відбувається.

Не створювати загальну `features/charts` як bucket усіх бізнес-візуалізацій. Повторно використаний generic ChartFrame може жити в shared; market-specific selector лишається domain, а конкретна interaction — feature.

## Перша сесія агента

1. Прочитати AGENTS.md, engineering rules, цей документ та source brief.
2. Перевірити checkout. Якщо implementation repo ще немає, створити окремий project folder у дозволеному workspace; не реалізовувати застосунок всередині source archive або пакета плану.
3. Перенести agent-kit у root repo, зберігши наявні repo rules, якщо вони є.
4. Уточнити source paths і environment у STATUS. Використати підготовлений `features/F00-foundation.md` із цієї engineering папки, адаптувавши environment details.
5. Реалізувати й перевірити F00; зробити foundation commit. Лише потім почати F01.
6. Далі йти по feature sequence з перевірками та commits без повторних запитів дозволу на вже авторизовану реалізацію.

Наразі авторизовано підготовку архітектури/процесу. Цей документ є handoff для майбутньої implementation сесії, не твердженням, що код чи commits уже створені.
