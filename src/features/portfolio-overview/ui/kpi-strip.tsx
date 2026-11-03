import type { PortfolioHealth } from "@/domains/market";
import { formatPercent, formatPeriod, formatUsdCompact, formatUsdExact } from "@/shared/lib/format";

function Kpi({ label, value, note, title }: { label: string; value: string; note: string; title?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-3xl font-semibold tabular-nums tracking-tight" title={title}>
        {value}
      </dd>
      <dd className="mt-1 text-xs text-muted">{note}</dd>
    </div>
  );
}

export function KpiStrip({ health, snapshotPeriod }: { health: PortfolioHealth; snapshotPeriod: string }) {
  const { metrics, statusCounts, needsAttention, period } = health;
  const month = formatPeriod(period);
  return (
    <section aria-labelledby="health-heading">
      <h2 id="health-heading" className="text-lg font-semibold">
        Portfolio health
      </h2>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Source: dataset · all markets and products</p>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Revenue"
          value={formatUsdCompact(metrics.actual)}
          title={formatUsdExact(metrics.actual)}
          note={`${formatUsdExact(metrics.actual)} · derived from monthly facts, ${month}`}
        />
        <Kpi
          label="Growth vs prior year"
          value={formatPercent(metrics.growthPct, { signed: true })}
          note={`Prior year ${formatUsdExact(metrics.priorYear)} · derived, ${month}`}
        />
        <Kpi
          label="Forecast attainment"
          value={formatPercent(metrics.attainmentPct)}
          note={`Forecast ${formatUsdExact(metrics.forecast)} · gap ${formatUsdExact(metrics.gap)} · derived, ${month}`}
        />
        <Kpi
          label="Markets needing attention"
          value={String(needsAttention)}
          note={`${statusCounts.at_risk} at risk + ${statusCounts.off_track} off track · ${statusCounts.on_track} on track · supplied status snapshot, ${formatPeriod(snapshotPeriod)}`}
        />
      </dl>
    </section>
  );
}
