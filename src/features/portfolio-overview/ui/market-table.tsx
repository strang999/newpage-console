"use client";

import { useMemo, useState } from "react";
import { sortMarketRows, type MarketRow, type SortDirection, type SortKey } from "@/domains/market";
import { formatInteger, formatPercent, formatPeriod, formatUsdExact } from "@/shared/lib/format";
import { StatusBadge } from "./status-badge";

type Column = { key: SortKey; label: string; align: "left" | "right"; firstDirection: SortDirection };

const COLUMNS: Column[] = [
  { key: "market", label: "Market", align: "left", firstDirection: "ascending" },
  { key: "region", label: "Region", align: "left", firstDirection: "ascending" },
  { key: "revenue", label: "Revenue", align: "right", firstDirection: "descending" },
  { key: "forecast", label: "Forecast", align: "right", firstDirection: "descending" },
  { key: "gap", label: "Gap", align: "right", firstDirection: "ascending" },
  { key: "growth", label: "YoY growth", align: "right", firstDirection: "descending" },
  { key: "attainment", label: "Attainment", align: "right", firstDirection: "ascending" },
  { key: "units", label: "Units", align: "right", firstDirection: "descending" },
  { key: "share", label: "Share*", align: "right", firstDirection: "descending" },
  { key: "status", label: "Status*", align: "left", firstDirection: "ascending" },
];

const cell = "px-2.5 py-1.5";

/**
 * The analyst table: every metric for every market, sortable from the keyboard (each header is a button; the active
 * column carries aria-sort), with a drill action per row. Unsorted order is the dataset order.
 */
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
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection } | null>(null);
  const shown = useMemo(() => (sort ? sortMarketRows(rows, sort.key, sort.direction) : [...rows]), [rows, sort]);

  function toggle(column: Column) {
    setSort((current) => {
      if (current?.key !== column.key) return { key: column.key, direction: column.firstDirection };
      return { key: column.key, direction: current.direction === "ascending" ? "descending" : "ascending" };
    });
  }

  return (
    <div>
      <h2 id="market-table-heading" className="text-lg font-semibold">
        All markets · {month}
      </h2>
      <p className="text-xs text-muted" aria-live="polite">
        {sort ? `Sorted by ${COLUMNS.find((c) => c.key === sort.key)?.label.replace("*", "")}, ${sort.direction}.` : "Dataset order. Select a column heading to sort."}
      </p>
      <div role="region" aria-labelledby="market-table-heading" tabIndex={0} className="mt-2 overflow-x-auto rounded-md border border-border bg-surface">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <caption className="sr-only">
            Revenue, forecast, gap, growth, forecast attainment and units by market for {month}, with the supplied market share and status snapshot. Column headings are buttons that sort the table.
          </caption>
          <thead className="bg-[var(--color-surface-sunken)]">
            <tr>
              {COLUMNS.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" aria-sort={active ? sort.direction : "none"} className={`whitespace-nowrap border-b border-border text-xs font-semibold text-muted ${c.align === "right" ? "text-right" : "text-left"}`}>
                    <button type="button" onClick={() => toggle(c)} className={`inline-flex w-full items-center gap-1 px-2.5 py-2 ${c.align === "right" ? "justify-end" : "justify-start"} ${active ? "text-[var(--color-text)]" : ""}`}>
                      {c.label}
                      <svg width="9" height="12" viewBox="0 0 9 12" aria-hidden="true" className={active ? "" : "opacity-30"}>
                        <path d="M4.5 0L9 5H0z" fill="currentColor" opacity={active && sort.direction === "descending" ? 0.25 : 1} />
                        <path d="M4.5 12L0 7h9z" fill="currentColor" opacity={active && sort.direction === "ascending" ? 0.25 : 1} />
                      </svg>
                    </button>
                  </th>
                );
              })}
              <th scope="col" className="border-b border-border px-2.5 py-2 text-left text-xs font-semibold text-muted">
                Drill
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ market, regionName, metrics, snapshot }) => (
              <tr key={market.id} className="border-b border-border last:border-b-0 hover:bg-[var(--color-canvas)]">
                <th scope="row" className={`${cell} whitespace-nowrap text-left font-medium`}>
                  {market.name}
                </th>
                <td className={`${cell} text-muted`}>{regionName}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatUsdExact(metrics.actual)}</td>
                <td className={`${cell} text-right tabular-nums text-muted`}>{formatUsdExact(metrics.forecast)}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatUsdExact(metrics.gap)}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatPercent(metrics.growthPct, { signed: true })}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatPercent(metrics.attainmentPct)}</td>
                <td className={`${cell} text-right tabular-nums text-muted`}>{formatInteger(metrics.units)}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatPercent(snapshot.sharePct)}</td>
                <td className={cell}>
                  <StatusBadge status={snapshot.status} />
                </td>
                <td className={cell}>
                  {onSelectMarket && (
                    <button type="button" onClick={() => onSelectMarket(market.id)} aria-label={`Open ${market.name} and its products`} className="rounded-sm text-[var(--color-accent)] underline underline-offset-2">
                      Products ›
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        * Supplied snapshot, {snapshotMonth}: market share and status exist only for the latest period and are not derived from the monthly series. Revenue, forecast, gap, growth, attainment and units
        are derived from monthly facts.
      </p>
    </div>
  );
}
