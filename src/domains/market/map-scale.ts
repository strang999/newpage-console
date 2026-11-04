import { formatPercent, formatUsdCompact } from "@/shared/lib/format";
import { displayOneDecimal } from "./rounding";
import type { MarketRow } from "./metrics";
import { STATUS_META } from "./status";
import type { MarketStatus } from "./schema";
import type { MapMetric } from "./view-state";

export type ScaleKind = "sequential" | "diverging" | "categorical";

export type MapScale = {
  metric: MapMetric;
  kind: ScaleKind;
  /** e.g. "Forecast attainment" */
  title: string;
  /** Ordered low -> high (or the three statuses). Each has a label with its numeric range. */
  classes: readonly { label: string }[];
  /** Index into `classes`, or null when the market has no value for this metric (shown as "No data"). */
  classify: (row: MarketRow) => number | null;
  /** The exact value as text, e.g. "$1.68M", "+7.3%", "Off track". */
  valueText: (row: MarketRow) => string;
  /** Provenance of the metric: status is a supplied snapshot, the others are derived. */
  source: "derived" | "supplied_snapshot";
};

const STATUS_ORDER: readonly MarketStatus[] = ["on_track", "at_risk", "off_track"];

/** Classification uses the value rounded to the one decimal shown in the UI, so a market never sits in a class its label contradicts. */
const display = displayOneDecimal;

function binned(value: number | null, lowerBounds: readonly number[]): number | null {
  if (value === null) return null;
  const v = display(value);
  let index = 0;
  for (const bound of lowerBounds) if (v >= bound) index += 1;
  return index;
}

const MINUS = "−";
const pct = (n: number) => `${n < 0 ? MINUS : ""}${Math.abs(n)}%`;

function rangeLabels(bounds: readonly number[]): { label: string }[] {
  const first = bounds[0] ?? 0;
  const last = bounds[bounds.length - 1] ?? 0;
  return [
    { label: `Under ${pct(first)}` },
    ...bounds.slice(0, -1).map((b, i) => ({ label: `${pct(b)} to under ${pct(bounds[i + 1] ?? b)}` })),
    { label: `${pct(last)} and above` },
  ];
}

/**
 * Builds the colour scale model for a metric. Revenue is data-dependent (equal-width bins across the markets shown);
 * growth and attainment use fixed bounds so a period change never silently re-scales the map.
 */
export function buildMapScale(metric: MapMetric, rows: readonly MarketRow[]): MapScale {
  if (metric === "status") {
    return {
      metric,
      kind: "categorical",
      title: "Status",
      classes: STATUS_ORDER.map((s) => ({ label: STATUS_META[s].label })),
      classify: (row) => STATUS_ORDER.indexOf(row.snapshot.status),
      valueText: (row) => STATUS_META[row.snapshot.status].label,
      source: "supplied_snapshot",
    };
  }
  if (metric === "growth") {
    const bounds = [-5, 0, 5, 10];
    return {
      metric,
      kind: "diverging",
      title: "Growth vs prior year",
      classes: rangeLabels(bounds),
      classify: (row) => binned(row.metrics.growthPct, bounds),
      valueText: (row) => formatPercent(row.metrics.growthPct, { signed: true }),
      source: "derived",
    };
  }
  if (metric === "attainment") {
    const bounds = [95, 98, 102, 105];
    return {
      metric,
      kind: "diverging",
      title: "Forecast attainment",
      classes: rangeLabels(bounds),
      classify: (row) => binned(row.metrics.attainmentPct, bounds),
      valueText: (row) => formatPercent(row.metrics.attainmentPct),
      source: "derived",
    };
  }

  const values = rows.map((r) => r.metrics.actual);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = (max - min) / 5 || 1;
  const edges = [1, 2, 3, 4].map((i) => min + step * i);
  return {
    metric,
    kind: "sequential",
    title: "Revenue",
    classes: [
      { label: `Under ${formatUsdCompact(edges[0] ?? min)}` },
      ...[0, 1, 2].map((i) => ({ label: `${formatUsdCompact(edges[i] ?? min)} to under ${formatUsdCompact(edges[i + 1] ?? max)}` })),
      { label: `${formatUsdCompact(edges[3] ?? max)} and above` },
    ],
    classify: (row) => {
      let index = 0;
      for (const e of edges) if (row.metrics.actual >= e) index += 1;
      return index;
    },
    valueText: (row) => formatUsdCompact(row.metrics.actual),
    source: "derived",
  };
}
