import { metricsFromFacts, type Dataset, type Scope } from "@/domains/market";

export type FactRow = {
  key: string;
  period: string;
  marketId: string;
  market: string;
  region: string;
  product: string;
  actual: number;
  forecast: number;
  gap: number;
  growthPct: number | null;
  attainmentPct: number | null;
  units: number;
};

export type FactSortKey = "period" | "market" | "region" | "product" | "actual" | "forecast" | "gap" | "growth" | "attainment" | "units";
export type FactSortDirection = "ascending" | "descending";

/** Every monthly fact in scope (all 1,560 at portfolio level), with the same derived metrics the dashboard shows. */
export function buildFactRows(dataset: Dataset, scope: Scope): FactRow[] {
  const markets = new Map(dataset.markets.map((m) => [m.id, m]));
  const regions = new Map(dataset.regions.map((r) => [r.id, r.name]));
  const products = new Map(dataset.products.map((p) => [p.id, p.name]));
  const rows: FactRow[] = [];
  for (const fact of dataset.series) {
    const market = markets.get(fact.marketId);
    if (!market) continue;
    if (scope.marketId && fact.marketId !== scope.marketId) continue;
    if (scope.regionId && market.regionId !== scope.regionId) continue;
    if (scope.productId && fact.productId !== scope.productId) continue;
    const m = metricsFromFacts([fact]);
    rows.push({
      key: `${fact.marketId}|${fact.productId}|${fact.period}`,
      period: fact.period,
      marketId: fact.marketId,
      market: market.name,
      region: regions.get(market.regionId) ?? market.regionId,
      product: products.get(fact.productId) ?? fact.productId,
      actual: fact.actual,
      forecast: fact.forecast,
      gap: m.gap,
      growthPct: m.growthPct,
      attainmentPct: m.attainmentPct,
      units: fact.units,
    });
  }
  return rows;
}

const VALUE: Record<FactSortKey, (r: FactRow) => string | number | null> = {
  period: (r) => r.period,
  market: (r) => r.market,
  region: (r) => r.region,
  product: (r) => r.product,
  actual: (r) => r.actual,
  forecast: (r) => r.forecast,
  gap: (r) => r.gap,
  growth: (r) => r.growthPct,
  attainment: (r) => r.attainmentPct,
  units: (r) => r.units,
};

/** Stable sort; a missing value (no prior year, no forecast) always sorts last, in either direction. Ties keep dataset order. */
export function sortFactRows(rows: readonly FactRow[], key: FactSortKey, direction: FactSortDirection): FactRow[] {
  const value = VALUE[key];
  const sign = direction === "ascending" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, v: value(row) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === b.v ? a.index - b.index : a.v === null ? 1 : -1;
      const c = typeof a.v === "string" && typeof b.v === "string" ? a.v.localeCompare(b.v, "en") : Number(a.v) - Number(b.v);
      return c !== 0 ? c * sign : a.index - b.index;
    })
    .map(({ row }) => row);
}
