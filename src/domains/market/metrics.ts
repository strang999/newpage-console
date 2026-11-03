import type { Dataset, Fact, Market, MarketStatus } from "./schema";

/** Where a displayed number comes from. Derived values are computed from `series`; snapshot values are supplied as-is. */
export type Provenance = "derived" | "supplied_snapshot";

export type Metrics = {
  actual: number;
  forecast: number;
  priorYear: number;
  units: number;
  /** actual - forecast */
  gap: number;
  /** Year-on-year growth in percent, or null when prior-year is zero (shown as N/A). */
  growthPct: number | null;
  /** actual / forecast in percent, or null when forecast is zero. */
  attainmentPct: number | null;
};

/** Percentages are always recomputed from summed amounts, never averaged across entities. */
export function metricsFromFacts(facts: readonly Fact[]): Metrics {
  let actual = 0;
  let forecast = 0;
  let priorYear = 0;
  let units = 0;
  for (const f of facts) {
    actual += f.actual;
    forecast += f.forecast;
    priorYear += f.priorYear;
    units += f.units;
  }
  return {
    actual,
    forecast,
    priorYear,
    units,
    gap: actual - forecast,
    growthPct: priorYear === 0 ? null : (actual / priorYear - 1) * 100,
    attainmentPct: forecast === 0 ? null : (actual / forecast) * 100,
  };
}

export type FactFilter = { period: string; regionId?: string; marketId?: string; productId?: string };

export function selectFacts(dataset: Dataset, filter: FactFilter): Fact[] {
  const marketsInRegion = filter.regionId
    ? new Set(dataset.markets.filter((m) => m.regionId === filter.regionId).map((m) => m.id))
    : null;
  return dataset.series.filter(
    (f) =>
      f.period === filter.period &&
      (!marketsInRegion || marketsInRegion.has(f.marketId)) &&
      (!filter.marketId || f.marketId === filter.marketId) &&
      (!filter.productId || f.productId === filter.productId),
  );
}

export function metricsFor(dataset: Dataset, filter: FactFilter): Metrics {
  return metricsFromFacts(selectFacts(dataset, filter));
}

export type MarketRow = {
  market: Market;
  regionName: string;
  /** Derived from series for the selected period. */
  metrics: Metrics;
  /** Supplied latest-period snapshot values. */
  snapshot: { sharePct: number; status: MarketStatus };
};

export function marketRows(dataset: Dataset, period: string): MarketRow[] {
  const regionName = new Map(dataset.regions.map((r) => [r.id, r.name]));
  return dataset.markets.map((market) => ({
    market,
    regionName: regionName.get(market.regionId) ?? market.regionId,
    metrics: metricsFor(dataset, { period, marketId: market.id }),
    snapshot: { sharePct: market.kpis.sharePct, status: market.kpis.status },
  }));
}

export type StatusCounts = Record<MarketStatus, number>;

/** Counts of the supplied status snapshot (latest period only). */
export function statusCounts(dataset: Dataset): StatusCounts {
  const counts: StatusCounts = { on_track: 0, at_risk: 0, off_track: 0 };
  for (const m of dataset.markets) counts[m.kpis.status] += 1;
  return counts;
}

export type PortfolioHealth = {
  period: string;
  metrics: Metrics;
  statusCounts: StatusCounts;
  /** at_risk + off_track, from the supplied snapshot. */
  needsAttention: number;
};

export function portfolioHealth(dataset: Dataset, period: string = dataset.meta.latestPeriod): PortfolioHealth {
  const counts = statusCounts(dataset);
  return {
    period,
    metrics: metricsFor(dataset, { period }),
    statusCounts: counts,
    needsAttention: counts.at_risk + counts.off_track,
  };
}
