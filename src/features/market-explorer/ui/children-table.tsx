import { childRows, scopeLevel, type Dataset, type Scope } from "@/domains/market";
import { formatPercent, formatUsdExact } from "@/shared/lib/format";
import type { ScopeSelection } from "../types";

const HEADINGS = { portfolio: "Regions", region: "Markets", market: "Products", product: "" } as const;
const th = "px-3 py-2 text-xs font-semibold text-muted";

export function ChildrenTable({
  dataset,
  scope,
  period,
  onSelect,
}: {
  dataset: Dataset;
  scope: Scope;
  period: string;
  onSelect: (s: ScopeSelection) => void;
}) {
  const level = scopeLevel(scope);
  const rows = childRows(dataset, scope, period);
  if (rows.length === 0) return null;
  const heading = HEADINGS[level];

  return (
    <div className="card">
      <h2 id="children-heading" className="text-lg font-semibold">
        {heading} <span className="text-sm font-normal text-muted">· select one to drill in</span>
      </h2>
      <div role="region" aria-labelledby="children-heading" tabIndex={0} className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <caption className="sr-only">{heading} with revenue, growth and forecast attainment</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className={`${th} text-left`}>
                {heading.replace(/s$/, "")}
              </th>
              <th scope="col" className={`${th} text-right`}>Revenue</th>
              <th scope="col" className={`${th} text-right`}>YoY growth</th>
              <th scope="col" className={`${th} text-right`}>Attainment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-b-0">
                <th scope="row" className="px-3 py-1.5 text-left font-normal">
                  <button
                    type="button"
                    onClick={() =>
                      onSelect(
                        row.kind === "region"
                          ? { region: row.id }
                          : row.kind === "market"
                            ? { market: row.id }
                            : { market: scope.marketId ?? null, product: row.id },
                      )
                    }
                    className="rounded-sm text-[var(--color-accent)] underline underline-offset-2"
                  >
                    {row.name}
                  </button>
                </th>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatUsdExact(row.metrics.actual)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatPercent(row.metrics.growthPct, { signed: true })}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatPercent(row.metrics.attainmentPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
