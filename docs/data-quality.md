# Data quality notes and fixture corrections

`data/starter/data.json` and `data/starter/fixtures.json` are kept byte-identical to the supplied starter (checked by `pnpm verify:starter`). Where a canned assistant answer contradicts the dataset, the correction lives in `data/overrides/fixtures.local.json` and is applied by `src/features/assistant/server.ts` on top of the original fixture. Only the answer `text` and `citations` change; fixture ids, keywords, kinds, confidence and the SSE protocol do not. `src/features/assistant/overrides.test.ts` recomputes every number in the corrected text from the dataset, so a wrong figure fails the build. All figures are May 2026, the latest month in the data.

## Corrections

| Fixture | Original claim | What the data says | Correction |
|---|---|---|---|
| `at-risk` | "Three markets stand out as at risk"; "the rest of the portfolio is on or near plan" | The status snapshot flags six markets: 2 off track (Germany, Spain), 4 at risk (UK, Italy, Brazil, France). UK is at 94.6% of forecast and France 96.7%, so they are not "near plan". | Names all six with their figures; says seven are on track. "Softening demand" for Italy is dropped: the data shows Italy at 93.8% of forecast and +0.3% YoY, not a cause. |
| `apac-vs-europe` | Europe "hovering just below" 100%; only Germany and Italy under plan | Europe is 95.4% of forecast (4.6 points under); Germany, Italy, UK and France are all under forecast. | States the regional growth and attainment and all four under-forecast markets. |
| `forecast-miss` | Implies a portfolio-level forecast miss ("the shortfall against forecast is concentrated...") | Portfolio revenue $22,850,419 vs forecast $22,748,448 = 100.4% (+$101,971). There is **no net forecast miss**. Shortfalls: Germany −$141,058, UK −$117,597, Italy −$61,722, France −$55,492, Brazil −$52,249; by region Europe −$341,426 and LATAM −$39,429, offset by APAC +$440,302 and North America +$42,524. | States there is no net miss, then lists where the shortfalls are. Keeps the original low-confidence framing: the data cannot explain *why*. |
| `summary-long` | "The United States is the single largest market"; UK, France and Spain "close to plan"; markets to watch "Germany, Italy and Brazil" | China is the largest market ($3,776,883) ahead of the US ($2,949,131) and Japan ($2,909,296). UK (94.6%) and France (96.7%) are under forecast; Spain is above forecast (104.7%) but −4.6% YoY. Six markets are flagged, not three. | Corrected figures and ranking; lists all six flagged markets. |
| `germany-dip`, `next-year`, `default`, `error` | n/a | Verified consistent with the data (Germany −27% month on month in March 2026, all five products down 29–35% YoY in March, May still −9.7% YoY; horizon ends 2026-05). | Unchanged. |

"This quarter" in the brief and in fixtures: the data ends in May 2026, an incomplete Q2, so answers refer to "May 2026, the latest month in the data" and no quarter aggregate is shown.

## Other dataset observations (not changed, shown as supplied)

- **Status and attainment can disagree.** Spain is `off_track` with 104.7% derived forecast attainment (revenue is −4.6% YoY); the snapshot status is shown exactly as supplied, labelled "supplied snapshot, May 2026", and the derived numbers are shown beside it. Nothing is recomputed to make them agree.
- **Share and status exist only at the latest period** and only per market. There is no historical, regional or per-product share or status; none is invented. Share values do not sum across markets (they are synthetic market-share percentages per market).
- **Supplied KPI revenue vs derived**: differs from the sum of the monthly facts by at most $1 (rounding in the supplied snapshot); the derived value is shown.
- Growth and attainment for regions and the portfolio are recomputed from summed amounts, never averaged from market percentages.
- All amounts are USD; periods are calendar months (`YYYY-MM`) formatted without any time-zone conversion.
