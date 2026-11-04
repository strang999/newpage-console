import type { Comparison } from "@/domains/market";
import { formatPercent, formatUsdExact } from "@/shared/lib/format";
import { seriesFor } from "../series";

const th = "px-3 py-2 text-xs font-semibold text-muted";

function Position({ value }: { value: number | null }) {
  return <span className="block text-xs font-normal text-muted">{value === null ? "no position" : `position ${Math.round(value)}/100`}</span>;
}

/** Raw values always sit next to the radar; the 0-100 position is shown small, so the normalisation is never hidden. */
export function RawTable({ comparison, periodLabel, snapshotLabel }: { comparison: Comparison; periodLabel: string; snapshotLabel: string }) {
  const hasShare = comparison.type === "market";
  return (
    <div role="region" aria-label="Comparison values" tabIndex={0} className="overflow-x-auto rounded-sm border border-border">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <caption className="sr-only">
          Raw revenue, year-on-year growth and forecast attainment for the compared {comparison.type === "market" ? "markets" : "regions"} in {periodLabel}, with each value&apos;s 0 to 100 radar
          position
        </caption>
        <thead className="bg-[var(--color-surface-sunken)]">
          <tr>
            <th scope="col" className={`${th} text-left`}>
              {comparison.type === "market" ? "Market" : "Region"}
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
            {hasShare && (
              <th scope="col" className={`${th} text-right`}>
                Share*
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {comparison.entities.map((e, i) => {
            const s = seriesFor(i);
            return (
              <tr key={e.id} className="border-t border-border">
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  <span className="flex items-center gap-2">
                    <svg width="28" height="8" aria-hidden="true">
                      <line x1="1" y1="4" x2="27" y2="4" stroke={s.color} strokeWidth="3" strokeDasharray={s.dash} />
                    </svg>
                    {e.name}
                  </span>
                </th>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatUsdExact(e.raw.revenue)}
                  <Position value={e.scores.revenue} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatPercent(e.raw.growthPct, { signed: true })}
                  <Position value={e.scores.growth} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatPercent(e.raw.attainmentPct)}
                  <Position value={e.scores.attainment} />
                </td>
                {hasShare && (
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatPercent(e.sharePct)}
                    <span className="block text-xs font-normal text-muted">{snapshotLabel}</span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
