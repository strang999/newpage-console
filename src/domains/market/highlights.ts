import { marketRows, type MarketRow } from "./metrics";
import type { Dataset, MarketStatus } from "./schema";

const SEVERITY: Record<MarketStatus, number> = { off_track: 0, at_risk: 1, on_track: 2 };

export type RiskItem = {
  row: MarketRow;
  /** Supplied latest-period snapshot. */
  status: MarketStatus;
  /** actual - forecast for the selected period; negative means under forecast. */
  gap: number;
  attainmentPct: number | null;
};

/**
 * The flagged markets (off track, then at risk), most severe first; within a status the furthest under forecast first.
 * Status is the supplied snapshot; attainment and gap are derived for the selected period, so the two can disagree
 * (e.g. Spain is off track yet above forecast) and both are shown rather than reconciled.
 */
export function topRisks(dataset: Dataset, period: string, limit = 5): RiskItem[] {
  return marketRows(dataset, period)
    .filter((r) => r.snapshot.status !== "on_track")
    .map((row) => ({ row, status: row.snapshot.status, gap: row.metrics.gap, attainmentPct: row.metrics.attainmentPct }))
    .sort(
      (a, b) =>
        SEVERITY[a.status] - SEVERITY[b.status] ||
        (a.attainmentPct ?? Infinity) - (b.attainmentPct ?? Infinity) ||
        a.row.market.name.localeCompare(b.row.market.name),
    )
    .slice(0, limit);
}

export type MoverItem = {
  row: MarketRow;
  /** actual - priorYear in dollars, the sort key (by absolute size). */
  delta: number;
  growthPct: number | null;
};

/** Markets ranked by the absolute year-on-year revenue change, with the growth percentage beside it. */
export function topMovers(dataset: Dataset, period: string, limit = 5): MoverItem[] {
  return marketRows(dataset, period)
    .map((row) => ({ row, delta: row.metrics.actual - row.metrics.priorYear, growthPct: row.metrics.growthPct }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.row.market.name.localeCompare(b.row.market.name))
    .slice(0, limit);
}

export type SortKey = "market" | "region" | "revenue" | "forecast" | "gap" | "growth" | "attainment" | "units" | "share" | "status";
export type SortDirection = "ascending" | "descending";

const VALUE: Record<SortKey, (r: MarketRow) => number | string | null> = {
  market: (r) => r.market.name,
  region: (r) => r.regionName,
  revenue: (r) => r.metrics.actual,
  forecast: (r) => r.metrics.forecast,
  gap: (r) => r.metrics.gap,
  growth: (r) => r.metrics.growthPct,
  attainment: (r) => r.metrics.attainmentPct,
  units: (r) => r.metrics.units,
  share: (r) => r.snapshot.sharePct,
  status: (r) => SEVERITY[r.snapshot.status],
};

/** Stable sort; missing values (N/A) always sort last, in either direction; ties keep market-name order. */
export function sortMarketRows(rows: readonly MarketRow[], key: SortKey, direction: SortDirection): MarketRow[] {
  const sign = direction === "ascending" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = VALUE[key](a);
    const vb = VALUE[key](b);
    if (va === null && vb === null) return a.market.name.localeCompare(b.market.name);
    if (va === null) return 1;
    if (vb === null) return -1;
    const cmp = typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb) : Number(va) - Number(vb);
    return sign * cmp || a.market.name.localeCompare(b.market.name);
  });
}
