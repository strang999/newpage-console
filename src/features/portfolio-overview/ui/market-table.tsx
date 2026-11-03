import type { MarketRow } from "@/domains/market";
import { formatPercent, formatPeriod, formatUsdExact } from "@/shared/lib/format";
import { StatusBadge } from "./status-badge";

const th = "whitespace-nowrap border-b border-border px-3 py-2 text-left text-xs font-semibold text-muted";
const num = "px-3 py-2 text-right tabular-nums";

export function MarketTable({
  rows,
  period,
  snapshotPeriod,
  onSelectMarket,
}: {
  rows: readonly MarketRow[];
  period: string;
  snapshotPeriod: string;
  onSelectMarket?: (marketId: string) => void;
}) {
  const month = formatPeriod(period);
  const snapshotMonth = formatPeriod(snapshotPeriod);
  return (
    <div>
      <h2 id="market-table-heading" className="text-lg font-semibold">
        All markets · {month}
      </h2>
      <div
        role="region"
        aria-labelledby="market-table-heading"
        tabIndex={0}
        className="mt-2 overflow-x-auto rounded-md border border-border bg-surface"
      >
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <caption className="sr-only">
            Revenue, growth and forecast attainment by market for {month}, with the supplied market share and status
            snapshot
          </caption>
          <thead className="bg-[var(--color-surface-sunken)]">
            <tr>
              <th scope="col" className={th}>
                Market
              </th>
              <th scope="col" className={th}>
                Region
              </th>
              <th scope="col" className={`${th} text-right`}>
                Revenue
              </th>
              <th scope="col" className={`${th} text-right`}>
                YoY growth
              </th>
              <th scope="col" className={`${th} text-right`}>
                Attainment
              </th>
              <th scope="col" className={`${th} text-right`}>
                Share*
              </th>
              <th scope="col" className={th}>
                Status*
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ market, regionName, metrics, snapshot }) => (
              <tr key={market.id} className="border-b border-border last:border-b-0">
                <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  {onSelectMarket ? (
                    <button
                      type="button"
                      onClick={() => onSelectMarket(market.id)}
                      className="rounded-sm text-[var(--color-accent)] underline underline-offset-2"
                    >
                      {market.name}
                    </button>
                  ) : (
                    market.name
                  )}
                </th>
                <td className="px-3 py-2 text-muted">{regionName}</td>
                <td className={num}>{formatUsdExact(metrics.actual)}</td>
                <td className={num}>{formatPercent(metrics.growthPct, { signed: true })}</td>
                <td className={num}>{formatPercent(metrics.attainmentPct)}</td>
                <td className={num}>{formatPercent(snapshot.sharePct)}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={snapshot.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        * Supplied snapshot, {snapshotMonth}: market share and status exist only for the latest period and are not derived from
        the monthly series. Revenue, growth and attainment are derived from monthly facts.
      </p>
    </div>
  );
}
