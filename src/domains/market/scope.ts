import { metricsFromFacts, type Metrics } from "./metrics";
import type { Dataset, Fact } from "./schema";

/** A node in the portfolio -> region -> market -> product hierarchy. All null = the whole portfolio. */
export type Scope = { regionId?: string | null; marketId?: string | null; productId?: string | null };

export type ScopeLevel = "portfolio" | "region" | "market" | "product";

export function scopeLevel(scope: Scope): ScopeLevel {
  if (scope.productId && scope.marketId) return "product";
  if (scope.marketId) return "market";
  if (scope.regionId) return "region";
  return "portfolio";
}

function scopeFacts(dataset: Dataset, scope: Scope): Fact[] {
  const marketsInRegion =
    scope.regionId && !scope.marketId
      ? new Set(dataset.markets.filter((m) => m.regionId === scope.regionId).map((m) => m.id))
      : null;
  return dataset.series.filter(
    (f) =>
      (!marketsInRegion || marketsInRegion.has(f.marketId)) &&
      (!scope.marketId || f.marketId === scope.marketId) &&
      (!scope.productId || f.productId === scope.productId),
  );
}

export function scopeLabel(dataset: Dataset, scope: Scope): string {
  const level = scopeLevel(scope);
  const market = dataset.markets.find((m) => m.id === scope.marketId);
  const product = dataset.products.find((p) => p.id === scope.productId);
  const region = dataset.regions.find((r) => r.id === scope.regionId);
  if (level === "product") return `${market?.name ?? scope.marketId} · ${product?.name ?? scope.productId}`;
  if (level === "market") return market?.name ?? String(scope.marketId);
  if (level === "region") return region?.name ?? String(scope.regionId);
  return "Portfolio overview";
}

export type SeriesPoint = { period: string; actual: number; forecast: number; priorYear: number };

/** One point per dataset period for the scope. Sums only; no derived percentages here. */
export function timeSeries(dataset: Dataset, scope: Scope): SeriesPoint[] {
  const byPeriod = new Map<string, Fact[]>();
  for (const f of scopeFacts(dataset, scope)) {
    const list = byPeriod.get(f.period);
    if (list) list.push(f);
    else byPeriod.set(f.period, [f]);
  }
  return dataset.meta.periods.map((period) => {
    const m = metricsFromFacts(byPeriod.get(period) ?? []);
    return { period, actual: m.actual, forecast: m.forecast, priorYear: m.priorYear };
  });
}

export type ChildKind = "region" | "market" | "product";
export type ChildRow = { kind: ChildKind; id: string; name: string; metrics: Metrics };

/** The next level down from the scope, with metrics for the period. Products have no children. */
export function childRows(dataset: Dataset, scope: Scope, period: string): ChildRow[] {
  const level = scopeLevel(scope);
  const inPeriod = (facts: Fact[]) => facts.filter((f) => f.period === period);
  if (level === "portfolio") {
    return dataset.regions.map((r) => ({
      kind: "region",
      id: r.id,
      name: r.name,
      metrics: metricsFromFacts(inPeriod(scopeFacts(dataset, { regionId: r.id }))),
    }));
  }
  if (level === "region") {
    return dataset.markets
      .filter((m) => m.regionId === scope.regionId)
      .map((m) => ({
        kind: "market",
        id: m.id,
        name: m.name,
        metrics: metricsFromFacts(inPeriod(scopeFacts(dataset, { marketId: m.id }))),
      }));
  }
  if (level === "market") {
    return dataset.products.map((p) => ({
      kind: "product",
      id: p.id,
      name: p.name,
      metrics: metricsFromFacts(inPeriod(scopeFacts(dataset, { marketId: scope.marketId, productId: p.id }))),
    }));
  }
  return [];
}

export function scopeMetrics(dataset: Dataset, scope: Scope, period: string): Metrics {
  return metricsFromFacts(scopeFacts(dataset, scope).filter((f) => f.period === period));
}
