"use client";

import { lazy, Suspense, useId, useMemo, useState } from "react";
import { scopeLabel, scopeMetrics, timeSeries, type Dataset, type Scope, type SeriesPoint } from "@/domains/market";
import { formatPercent, formatPeriod, formatUsdExact } from "@/shared/lib/format";
import { ErrorBoundary, SurfaceFallback } from "@/shared/ui/error-boundary";
import { RenderWhenNear } from "@/shared/ui/render-when-near";

// React.lazy caches a failed import for good, so a retry needs a fresh lazy component (see `retry` below).
const loadChart = () => import("./trend-chart");
let TrendChart = lazy(loadChart);

const toggle = "rounded-sm border px-3 py-1 text-sm font-medium";

export function TrendPanel({ dataset, scope, period }: { dataset: Dataset; scope: Scope; period: string }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const [attempt, setAttempt] = useState(0); // see the map: re-renders so the fresh lazy component replaces the rejected one
  const headingId = useId();
  const { regionId, marketId, productId } = scope;
  const stableScope = useMemo<Scope>(() => ({ regionId, marketId, productId }), [regionId, marketId, productId]);
  const points = useMemo(() => timeSeries(dataset, stableScope), [dataset, stableScope]);
  const metrics = useMemo(() => scopeMetrics(dataset, stableScope, period), [dataset, stableScope, period]);
  const label = scopeLabel(dataset, scope);
  const month = formatPeriod(period);

  return (
    <section aria-labelledby={headingId} className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-lg font-semibold">
          Actual vs forecast vs prior year
        </h2>
        <div role="group" aria-label="Trend display" className="flex gap-2">
          {(["chart", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`${toggle} ${
                view === v
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
                  : "border-[var(--color-border-strong)] bg-surface"
              }`}
            >
              {v === "chart" ? "Chart" : "Table"}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-2 text-sm">
        <span className="font-medium">{label}, {month}:</span> actual {formatUsdExact(metrics.actual)} against a forecast of{" "}
        {formatUsdExact(metrics.forecast)} (attainment {formatPercent(metrics.attainmentPct)}); prior year{" "}
        {formatUsdExact(metrics.priorYear)} (growth {formatPercent(metrics.growthPct, { signed: true })}). Source:
        dataset.
      </p>

      {view === "chart" ? (
        <div className="mt-3" role="group" aria-label={`Line chart of monthly revenue for ${label}; the table view has the same values`}>
          <ErrorBoundary
            surface="trend-chart"
            fallback={(retry) => (
              <div className="flex flex-col gap-3">
                <SurfaceFallback
                  title="The chart could not be drawn."
                  detail="The table below has the same monthly values."
                  retry={() => {
                    TrendChart = lazy(loadChart);
                    setAttempt((n) => n + 1);
                    retry();
                  }}
                />
                <TrendTable points={points} period={period} label={label} />
              </div>
            )}
          >
            {/* The chart needs a definite height (it is 100% high); the fallback above may be any height. */}
            <div className="h-[320px]">
              <RenderWhenNear placeholder={<p className="p-4 text-sm text-muted">Chart loads as you scroll to it. The table view has the same values.</p>}>
                <Suspense fallback={<p className="p-4 text-sm text-muted">Loading chart…</p>}>
                  <TrendChart key={attempt} points={points} period={period} />
                </Suspense>
              </RenderWhenNear>
            </div>
          </ErrorBoundary>
        </div>
      ) : (
        <TrendTable points={points} period={period} label={label} />
      )}
    </section>
  );
}

function TrendTable({ points, period, label }: { points: SeriesPoint[]; period: string; label: string }) {
  return (
    <div role="region" aria-label="Monthly values table" tabIndex={0} className="mt-3 max-h-[320px] overflow-auto rounded-sm border border-border">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <caption className="sr-only">Monthly actual, forecast and prior-year revenue for {label}</caption>
        <thead className="sticky top-0 bg-[var(--color-surface-sunken)]">
          <tr>
            {["Month", "Actual", "Forecast", "Prior year"].map((h, i) => (
              <th key={h} scope="col" className={`px-3 py-2 text-xs font-semibold text-muted ${i === 0 ? "text-left" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.period} className={`border-t border-border ${p.period === period ? "bg-[var(--color-accent-soft)] font-medium" : ""}`}>
              <th scope="row" className="px-3 py-1.5 text-left font-normal">
                {formatPeriod(p.period)}
                {p.period === period ? " (selected)" : ""}
              </th>
              <td className="px-3 py-1.5 text-right tabular-nums">{formatUsdExact(p.actual)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{formatUsdExact(p.forecast)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{formatUsdExact(p.priorYear)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
