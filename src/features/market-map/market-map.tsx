"use client";

import { lazy, Suspense, useId, useMemo, useState } from "react";
import { buildMapScale, formatPeriodLabel, marketRows, type Dataset, type MapMetric } from "@/domains/market";
import { Legend } from "./ui/legend";
import { MapTable } from "./ui/map-table";
import type { Readout } from "./ui/map-canvas";

const MapCanvas = lazy(() => import("./ui/map-canvas"));

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
  const [readout, setReadout] = useState<Readout | null>(null);
  const name = useId();
  const periodLabel = formatPeriodLabel(period);
  const rows = useMemo(() => marketRows(dataset, period), [dataset, period]);
  const scale = useMemo(() => buildMapScale(metric, rows), [metric, rows]);
  const snapshotLabel = formatPeriodLabel(dataset.meta.latestPeriod);

  const readoutText = readout
    ? readout.row
      ? `${readout.name}: ${scale.title} ${scale.valueText(readout.row)}`
      : `${readout.name}: No data`
    : "Hover or focus a country for its value. Select a market to drill in.";

  return (
    <section aria-labelledby={`${name}-title`} className="rounded-md border border-border bg-surface p-4">
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
              onClick={() => setView(v)}
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
          <div className="mt-3 aspect-[800/410] w-full" role="group" aria-label={`Map of the ${rows.length} markets coloured by ${scale.title}. Countries without data are hatched. The table view has the same values.`}>
            <Suspense fallback={<p className="p-4 text-sm text-muted">Loading map…</p>}>
              <MapCanvas rows={rows} scale={scale} selectedMarket={selectedMarket} onSelect={onSelectMarket} onReadout={setReadout} />
            </Suspense>
          </div>
          <p className="mt-1 min-h-5 text-sm" data-testid="map-readout">
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
