import { metricsFromFacts } from "./metrics";
import type { Dataset, Fact } from "./schema";
import { formatPeriodLabel } from "./period";
import { displayOneDecimal } from "./rounding";

/** Lower bounds, in percentage points versus forecast. Fixed so the colours mean the same thing in every period and region. */
export const HEATMAP_BOUNDS = [-6, -2, 2, 6] as const;

export const HEATMAP_CLASSES: readonly { label: string }[] = [
  { label: "Under −6 pts" },
  { label: "−6 to under −2 pts" },
  { label: "−2 to under +2 pts (on plan)" },
  { label: "+2 to under +6 pts" },
  { label: "+6 pts and above" },
];

export type HeatmapCell = {
  marketId: string;
  period: string;
  /** Forecast attainment minus 100, in percentage points. Null when the forecast is zero. */
  gapPts: number | null;
  attainmentPct: number | null;
  /** Index into HEATMAP_CLASSES, or null with no value. */
  cls: number | null;
};

export type Heatmap = {
  rows: { marketId: string; name: string }[];
  periods: string[];
  /** cells[row][column], same order as rows and periods */
  cells: HeatmapCell[][];
};

const displayed = displayOneDecimal;

export function classifyGap(gapPts: number | null): number | null {
  if (gapPts === null) return null;
  const v = displayed(gapPts);
  return HEATMAP_BOUNDS.filter((b) => v >= b).length;
}

/**
 * Markets x periods grid of forecast attainment minus 100. Rows are the markets of `regionId`, or all markets at the
 * portfolio level; the grid never collapses to a single row when one market is selected.
 */
export function buildHeatmap(dataset: Dataset, { regionId }: { regionId: string | null }): Heatmap {
  const byCell = new Map<string, Fact[]>();
  for (const f of dataset.series) {
    const key = `${f.marketId}|${f.period}`;
    const list = byCell.get(key);
    if (list) list.push(f);
    else byCell.set(key, [f]);
  }
  const markets = dataset.markets.filter((m) => !regionId || m.regionId === regionId);
  const periods = [...dataset.meta.periods];
  return {
    rows: markets.map((m) => ({ marketId: m.id, name: m.name })),
    periods,
    cells: markets.map((m) =>
      periods.map((period) => {
        const attainmentPct = metricsFromFacts(byCell.get(`${m.id}|${period}`) ?? []).attainmentPct;
        const gapPts = attainmentPct === null ? null : attainmentPct - 100;
        return { marketId: m.id, period, gapPts, attainmentPct, cls: classifyGap(gapPts) };
      }),
    ),
  };
}

/** "+2.3" / "−7.8" with a true minus sign, one decimal. */
export function formatGapPts(gapPts: number | null): string {
  if (gapPts === null) return "N/A";
  const v = displayed(gapPts);
  if (v === 0) return "0.0";
  return `${v < 0 ? "−" : "+"}${Math.abs(v).toFixed(1)}`;
}

/** Accessible name of one cell, e.g. "Germany, Mar 2026: 92.2% of forecast, 7.8 points under forecast". */
export function describeCell(name: string, cell: HeatmapCell): string {
  const month = formatPeriodLabel(cell.period);
  if (cell.gapPts === null || cell.attainmentPct === null) return `${name}, ${month}: no forecast`;
  const pts = Math.abs(displayed(cell.gapPts)).toFixed(1);
  const verdict = displayed(cell.gapPts) === 0 ? "on forecast" : `${pts} points ${cell.gapPts < 0 ? "under" : "over"} forecast`;
  return `${name}, ${month}: ${cell.attainmentPct.toFixed(1)}% of forecast, ${verdict}`;
}
