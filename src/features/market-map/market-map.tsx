"use client";

import { lazy, Suspense, useId, useMemo, useState } from "react";
import { buildMapScale, formatPeriodLabel, marketRows, type Dataset, type MapMetric } from "@/domains/market";
import { ErrorBoundary, SurfaceFallback } from "@/shared/ui/error-boundary";
import { RenderWhenNear } from "@/shared/ui/render-when-near";
import { Legend } from "./ui/legend";
import { MapTable } from "./ui/map-table";
import type { Pointer } from "./ui/map-canvas";

// React.lazy caches a failed import for good, so a retry needs a fresh lazy component (see `retry` below).
const loadCanvas = () => import("./ui/map-canvas");
let MapCanvas = lazy(loadCanvas);

const METRICS: { id: MapMetric; label: string }[] = [
  { id: "revenue", label: "Revenue" },
  { id: "growth", label: "Growth" },
  { id: "attainment", label: "Attainment" },
  { id: "status", label: "Status" },
];

export function MarketMap({
  dataset,
  period,
  metric,
  selectedMarket,
  onMetricChange,
  onSelectMarket,
}: {
  dataset: Dataset;
  period: string;
  metric: MapMetric;
  selectedMarket: string | null;
  onMetricChange: (metric: MapMetric) => void;
  onSelectMarket: (marketId: string) => void;
}) {
  const [view, setView] = useState<"map" | "table">("map");
  const [attempt, setAttempt] = useState(0); // bumping it re-renders this component, so the fresh lazy component below is used
  const [hover, setHover] = useState<Pointer | null>(null);
  const [focusedMarket, setFocusedMarket] = useState<string | null>(null);
  const name = useId();
  const periodLabel = formatPeriodLabel(period);
  const rows = useMemo(() => marketRows(dataset, period), [dataset, period]);
  const scale = useMemo(() => buildMapScale(metric, rows), [metric, rows]);
  const snapshotLabel = formatPeriodLabel(dataset.meta.latestPeriod);

  // Resolved against the current rows on every render, so a period or metric change can never leave a stale value.
  const pointer: Pointer | null = hover ?? (focusedMarket ? { kind: "market", marketId: focusedMarket } : null);
  const pointed = pointer?.kind === "market" ? rows.find((r) => r.market.id === pointer.marketId) : undefined;
  const readoutText = pointer
    ? pointed
      ? `${pointed.market.name}: ${scale.title} ${scale.valueText(pointed)}`
      : pointer.kind === "other"
        ? `${pointer.name}: No data`
        : "Hover or focus a country for its value. Select a market to drill in."
    : "Hover or focus a country for its value. Select a market to drill in.";

  function switchView(next: "map" | "table") {
    // The canvas unmounts on the table view; drop pointer state so nothing stale survives the switch.
    setHover(null);
    setFocusedMarket(null);
    setView(next);
  }

  return (
    <section aria-labelledby={`${name}-title`} className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id={`${name}-title`} className="text-lg font-semibold">
            Markets on the map
          </h2>
          <p className="text-xs text-muted">
            {scale.title} · {scale.source === "derived" ? `derived, ${periodLabel}` : `supplied snapshot, ${snapshotLabel}`} · Source: dataset
          </p>
        </div>
        <div role="group" aria-label="Map display" className="flex gap-2">
          {(["map", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => switchView(v)}
              className={`rounded-sm border px-3 py-1 text-sm font-medium ${view === v ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-contrast)]" : "border-[var(--color-border-strong)] bg-surface"}`}
            >
              {v === "map" ? "Map" : "Table"}
            </button>
          ))}
        </div>
      </div>

      <fieldset className="mt-3">
        <legend className="sr-only">Colour the map by</legend>
        <div className="flex flex-wrap gap-2">
          {METRICS.map((m) => (
            <label key={m.id} className="cursor-pointer">
              <input type="radio" name={`${name}-metric`} value={m.id} checked={metric === m.id} onChange={() => onMetricChange(m.id)} className="peer sr-only" />
              <span className="inline-block rounded-full border border-[var(--color-border-strong)] px-3 py-1 text-sm peer-checked:border-[var(--color-accent)] peer-checked:bg-[var(--color-accent-soft)] peer-checked:font-semibold peer-focus-visible:shadow-[var(--focus-ring)]">
                {m.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {view === "map" ? (
        <>
          <div className="mt-3 min-h-[12rem] w-full sm:aspect-[800/372]" role="group" aria-label={`Map of the ${rows.length} markets coloured by ${scale.title}. Countries without data are hatched. The table view has the same values.`}>
            <ErrorBoundary
              surface="map"
              fallback={(retry) => (
                <div className="flex flex-col gap-3">
                  <SurfaceFallback
                    title="The map could not be drawn."
                    detail="The table below has the same values for every market, and you can still select a market from it."
                    retry={() => {
                      MapCanvas = lazy(loadCanvas);
                      setAttempt((n) => n + 1);
                      retry();
                    }}
                  />
                  <MapTable rows={rows} scale={scale} selectedMarket={selectedMarket} periodLabel={periodLabel} onSelect={onSelectMarket} />
                </div>
              )}
            >
              <RenderWhenNear placeholder={<p className="p-4 text-sm text-muted">The map loads as you scroll to it. The table view has the same values.</p>}>
                <Suspense fallback={<p className="p-4 text-sm text-muted">Loading map…</p>}>
                  <MapCanvas key={attempt} rows={rows} scale={scale} selectedMarket={selectedMarket} focusedMarket={focusedMarket} onSelect={onSelectMarket} onHover={setHover} onFocusChange={setFocusedMarket} />
                </Suspense>
              </RenderWhenNear>
            </ErrorBoundary>
          </div>
          <p className="mt-1 min-h-[2.75rem] text-sm sm:min-h-6" data-testid="map-readout">
            {readoutText}
          </p>
        </>
      ) : (
        <div className="mt-3">
          <MapTable rows={rows} scale={scale} selectedMarket={selectedMarket} periodLabel={periodLabel} onSelect={onSelectMarket} />
        </div>
      )}

      <div className="mt-3">
        <Legend scale={scale} />
        <p className="mt-2 text-xs text-muted">Status is a supplied snapshot for {snapshotLabel}; it is not derived from the monthly series.</p>
      </div>
    </section>
  );
}
