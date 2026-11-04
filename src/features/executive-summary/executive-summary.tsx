"use client";

import { useId, useMemo } from "react";
import { formatPeriodLabel, STATUS_META, topMovers, topRisks, type Dataset } from "@/domains/market";
import { formatPercent, formatUsdExact } from "@/shared/lib/format";
import { StatusBadge } from "@/shared/ui/status-badge";

const link = "rounded-sm text-left font-medium text-[var(--color-accent)] underline underline-offset-2";

/** Executive view: where to look first (flagged markets) and what moved most, in a few lines each. */
export function ExecutiveSummary({ dataset, period, onSelectMarket }: { dataset: Dataset; period: string; onSelectMarket: (marketId: string) => void }) {
  const id = useId();
  const risks = useMemo(() => topRisks(dataset, period, 5), [dataset, period]);
  const movers = useMemo(() => topMovers(dataset, period, 5), [dataset, period]);
  const month = formatPeriodLabel(period);
  const snapshot = formatPeriodLabel(dataset.meta.latestPeriod);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-labelledby={`${id}-risks`} className="card">
        <h2 id={`${id}-risks`} className="text-lg font-semibold">
          Top risks
        </h2>
        <p className="text-xs text-muted">Flagged markets, most severe first · status is a supplied snapshot ({snapshot}); attainment and gap are derived for {month}</p>
        <ol className="mt-3 divide-y divide-[var(--color-border)]">
          {risks.map(({ row, status, gap, attainmentPct }) => (
            <li key={row.market.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => onSelectMarket(row.market.id)} className={link}>
                  {row.market.name}
                </button>
                <StatusBadge tone={STATUS_META[status].tone} label={STATUS_META[status].label} />
              </div>
              <p className="text-sm tabular-nums">
                {formatPercent(attainmentPct)} of forecast <span className="text-muted">· {gap < 0 ? `${formatUsdExact(Math.abs(gap))} under` : `${formatUsdExact(gap)} over`}</span>
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby={`${id}-movers`} className="card">
        <h2 id={`${id}-movers`} className="text-lg font-semibold">
          Top movers
        </h2>
        <p className="text-xs text-muted">Largest year-on-year revenue change in {month}, up or down · derived · Source: dataset</p>
        <ol className="mt-3 divide-y divide-[var(--color-border)]">
          {movers.map(({ row, delta, growthPct }) => {
            const up = delta >= 0;
            return (
              <li key={row.market.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                <button type="button" onClick={() => onSelectMarket(row.market.id)} className={link}>
                  {row.market.name}
                </button>
                <p className="flex items-center gap-2 text-sm tabular-nums">
                  <span className="inline-flex items-center gap-1 font-medium" style={{ color: up ? "var(--color-status-on-track)" : "var(--color-status-off-track)" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={up ? "M12 19V5M5 12l7-7 7 7" : "M12 5v14M19 12l-7 7-7-7"} />
                    </svg>
                    <span className="sr-only">{up ? "Up" : "Down"} </span>
                    {up ? "+" : ""}
                    {formatUsdExact(delta)}
                  </span>
                  <span className="text-muted">{formatPercent(growthPct, { signed: true })}</span>
                </p>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
