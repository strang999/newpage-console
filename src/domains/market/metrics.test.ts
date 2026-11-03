import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import raw from "@/data/starter/data.json";
import { datasetSchema, marketRows, metricsFor, metricsFromFacts, portfolioHealth } from "./index";

type AuditMetrics = {
  actual: number;
  forecast: number;
  priorYear: number;
  units: number;
  growthPct: number;
  forecastAttainmentPct: number;
  forecastGap: number;
};
type Audit = {
  portfolioLatest: AuditMetrics;
  regionsLatest: Record<string, AuditMetrics>;
  latestStatusCounts: Record<string, number>;
  markets: { id: string; calculatedLatest: AuditMetrics }[];
};
const audit = JSON.parse(readFileSync(new URL("../../../docs/data-audit.json", import.meta.url), "utf8")) as Audit;
const dataset = datasetSchema.parse(raw);

function expectMatches(actual: ReturnType<typeof metricsFromFacts>, golden: AuditMetrics) {
  expect(actual.actual).toBe(golden.actual);
  expect(actual.forecast).toBe(golden.forecast);
  expect(actual.priorYear).toBe(golden.priorYear);
  expect(actual.units).toBe(golden.units);
  expect(actual.gap).toBe(golden.forecastGap);
  expect(actual.growthPct).toBeCloseTo(golden.growthPct, 2);
  expect(actual.attainmentPct).toBeCloseTo(golden.forecastAttainmentPct, 2);
}

function first<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("fixture is empty");
  return item;
}

describe("dataset schema", () => {
  it("accepts the supplied dataset: 4 regions, 13 markets, 5 products, 24 periods, 1560 facts", () => {
    expect(dataset.regions).toHaveLength(4);
    expect(dataset.markets).toHaveLength(13);
    expect(dataset.products).toHaveLength(5);
    expect(dataset.meta.periods).toHaveLength(24);
    expect(dataset.series).toHaveLength(1560);
  });

  it("rejects a fact with a negative amount", () => {
    const bad = structuredClone(raw);
    first(bad.series).actual = -1;
    expect(datasetSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a fact referencing an unknown market", () => {
    const bad = structuredClone(raw);
    first(bad.series).marketId = "zz";
    expect(datasetSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a duplicated fact (missing facts must not pass silently)", () => {
    const bad = structuredClone(raw);
    bad.series[1] = { ...first(bad.series) };
    expect(datasetSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown status value and a malformed period", () => {
    const status = structuredClone(raw) as unknown as { markets: { kpis: { status: string } }[] };
    first(status.markets).kpis.status = "great";
    expect(datasetSchema.safeParse(status).success).toBe(false);
    const period = structuredClone(raw);
    first(period.series).period = "2026-13";
    expect(datasetSchema.safeParse(period).success).toBe(false);
  });
});

describe("portfolio, region and market aggregates match the independent audit", () => {
  const period = dataset.meta.latestPeriod;

  it("portfolio latest: $22,850,419 actual, +7.3% growth, 100.4% attainment", () => {
    const health = portfolioHealth(dataset);
    expectMatches(health.metrics, audit.portfolioLatest);
    expect(health.metrics.actual).toBe(22850419);
    expect(health.metrics.forecast).toBe(22748448);
    expect(health.metrics.attainmentPct).toBeCloseTo(100.448, 2);
    expect(health.metrics.growthPct).toBeCloseTo(7.306, 2);
  });

  it("status counts are 7 on track, 4 at risk, 2 off track; 6 need attention", () => {
    const health = portfolioHealth(dataset);
    expect(health.statusCounts).toEqual({ on_track: 7, at_risk: 4, off_track: 2 });
    expect(health.needsAttention).toBe(6);
  });

  it.each(["na", "eu", "apac", "latam"])("region %s", (regionId) => {
    const golden = audit.regionsLatest[regionId];
    if (!golden) throw new Error(`audit has no region ${regionId}`);
    expectMatches(metricsFor(dataset, { period, regionId }), golden);
  });

  it("all 13 markets", () => {
    const rows = marketRows(dataset, period);
    expect(rows).toHaveLength(13);
    for (const row of rows) {
      const golden = audit.markets.find((m) => m.id === row.market.id);
      if (!golden) throw new Error(`audit has no market ${row.market.id}`);
      expectMatches(row.metrics, golden.calculatedLatest);
    }
  });

  it("region growth is computed from summed amounts, not the average of market percentages", () => {
    const eu = metricsFor(dataset, { period, regionId: "eu" });
    const marketPct = marketRows(dataset, period)
      .filter((r) => r.market.regionId === "eu")
      .map((r) => r.metrics.growthPct ?? 0);
    const naiveAverage = marketPct.reduce((a, b) => a + b, 0) / marketPct.length;
    expect(Math.abs((eu.growthPct ?? 0) - naiveAverage)).toBeGreaterThan(0.01);
  });
});

describe("zero denominators", () => {
  const fact = { marketId: "x", productId: "p", period: "2026-05", actual: 100, forecast: 0, units: 1, priorYear: 0 };
  it("returns null (rendered N/A) instead of Infinity or 0", () => {
    const m = metricsFromFacts([fact]);
    expect(m.growthPct).toBeNull();
    expect(m.attainmentPct).toBeNull();
    expect(m.gap).toBe(100);
  });
});
