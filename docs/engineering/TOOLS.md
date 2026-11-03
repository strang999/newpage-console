# Skills та plugins: що вже є і як використовувати

Перевірено 3 листопада 2026 у поточному середовищі. Наявність тут не гарантує наявності в іншого агента; transfer package працює й без optional skills/plugins.

## Локальні skills

| Skill | Перевірений стан | Роль у workflow |
|---|---|---|
| react-patterns | Є локально; instructions прочитані | State ownership, pure render, boundaries, composition |
| frontend-patterns | Є локально; файл переглянуто | Загальні UI/data patterns; приклади оцінювати за project stack |
| vercel-composition-patterns | Є локально; entrypoint прочитаний | Public component APIs, контроль складності props/providers |
| react-testing | Є локально; файл переглянуто | Behavior-oriented component/integration tests |
| e2e-testing | Є локально; файл переглянуто | Playwright journeys, artifacts, async stability |
| review-agent | Файл знайдено у system skills та прочитано; не був у початковому каталозі | Read-only defect-first diff review при делегації; discoverability перевіряти в новій сесії |
| frontend-a11y / accessibility | Є в каталозі та файловій системі; тут повністю не аудіювалися | Підключити при реалізації chart/form keyboard behavior |
| design-system / frontend-design-direction | Є в каталозі та файловій системі; тут повністю не аудіювалися | Tokens, visual hierarchy, UI direction перед відповідною роботою |
| skill-creator | Є; використаний для цього package | Оформлення та validation переносимого skill |
| feature-delivery | Створений у цьому kit | Короткий reusable entrypoint для foundation → features → verify → commit |

Окремого end-to-end SDLC skill з feature-scoped Git workflow у перевірених локальних skill directories не виявлено. Це не твердження про весь публічний каталог.

**Важливі поправки при застосуванні існуючих skills:**

- Snippets не є verified implementation. Приклади можуть не відповідати встановленій версії framework; агент звіряє API перед копіюванням.
- Шаблон e2e-testing містить `networkidle`; для streaming app readiness перевіряти observable UI/protocol events, не очікувати network silence.
- Код React/testing examples не є причиною додати новий state library або React Router у Next.js app.
- React-testing має широкі coverage targets; для цього assignment важливі meaningful acceptance/failure tests. Відсоток coverage сам по собі не доказ якості.
- У skills є посилання на інші agents/commands; вони не стають доступними від самого текстового посилання.

## Plugins

| Plugin | Підтверджений стан | Застосування |
|---|---|---|
| GitHub | Installed; connector доступний | Repo/PR/CI work, коли implementation repo вже обраний; local commits через Git |
| Superpowers | Знайдений, installed=false на момент перевірки | За каталогом: planning, TDD, debugging, collaboration workflow |
| Context7 | Знайдений, installed=false | Опційний доступ до документації бібліотек; не потрібний для запуску цього workflow |

Superpowers найближчий до запитаного development-process plugin. Запропоновано встановлення; воно не було виконане цим агентом. Детальні instructions плагіна ще не прочитані, тому не припускаємо конкретні commands, approval gates або policies. Після встановлення слід прочитати актуальні skills і узгодити їх із repo rules та вже наданою авторизацією.

Більше plugins може бути в [каталозі](https://chatgpt.com/plugins). Нові інтеграції не є dependency foundation. Якщо потрібна можливість відсутня, використовувати доступні local tools/official docs і продовжувати незалежну роботу.

## Progressive skill loading

F00: feature-delivery + релевантний design/toolchain guidance.
F01–F02: react-patterns; react-testing для logic та URL behavior.
F03: streaming contract як primary source; react-testing/e2e-testing для async scenarios.
F04–F08: accessibility та composition skills за потреби конкретної feature.
Review: defect-first review; performance skill тільки за фактичним performance ризиком.

Не завантажувати всі skills на кожну задачу. Не використовувати Superpowers та власний workflow як два незалежні competing plans: repo feature record і STATUS залишаються спільним станом роботи.
