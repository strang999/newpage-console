import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import raw from "@/data/starter/data.json";
import { buildComparison, datasetSchema, metricsFor } from "./index";

const dataset = datasetSchema.parse(raw);
const audit = JSON.parse(readFileSync(new URL("../../../docs/data-audit.json", import.meta.url), "utf8")) as {
  markets: { id: string; calculatedLatest: { actual: number; growthPct: number; forecastAttainmentPct: number } }[];
  regionsLatest: Record<string, { actual: number; growthPct: number; forecastAttainmentPct: number }>;
};
const period = "2026-05";
const entity = (c: ReturnType<typeof buildComparison>, id: string) => {
  const e = c.entities.find((x) => x.id === id);
  if (!e) throw new Error(id);
  return e;
};
const axis = (c: ReturnType<typeof buildComparison>, id: string) => {
  const a = c.axes.find((x) => x.id === id);
  if (!a) throw new Error(id);
  return a;
};

describe("buildComparison: de, it, gb at 2026-05", () => {
  const c = buildComparison(dataset, { type: "market", ids: ["de", "it", "gb"], period });

  it("raw values match the independent audit", () => {
    for (const id of ["de", "it", "gb"]) {
      const g = audit.markets.find((m) => m.id === id)?.calculatedLatest;
      const e = entity(c, id);
      expect(e.raw.revenue).toBe(g?.actual);
      expect(e.raw.growthPct).toBeCloseTo(g?.growthPct ?? NaN, 2);
      expect(e.raw.attainmentPct).toBeCloseTo(g?.forecastAttainmentPct ?? NaN, 2);
    }
  });

  it("axis bounds come from the whole peer population of 13 markets, not from the 3 selected", () => {
    expect(c.populationSize).toBe(13);
    const revenues = audit.markets.map((m) => m.calculatedLatest.actual);
    const growth = audit.markets.map((m) => m.calculatedLatest.growthPct);
    const attain = audit.markets.map((m) => m.calculatedLatest.forecastAttainmentPct);
    expect(axis(c, "revenue").min).toBe(Math.min(...revenues));
    expect(axis(c, "revenue").max).toBe(Math.max(...revenues));
    expect(axis(c, "growth").min).toBeCloseTo(Math.min(...growth), 6);
    expect(axis(c, "growth").max).toBeCloseTo(Math.max(...growth), 6);
    expect(axis(c, "attainment").min).toBeCloseTo(Math.min(...attain), 6);
    expect(axis(c, "attainment").max).toBeCloseTo(Math.max(...attain), 6);
  });

  it("scores are 0-100 positions: the population minimum is 0 and the maximum is 100 (checked via the extremes)", () => {
    const all = buildComparison(dataset, { type: "market", ids: dataset.markets.map((m) => m.id), period });
    for (const a of ["revenue", "growth", "attainment"] as const) {
      const scores = all.entities.map((e) => e.scores[a] ?? NaN);
      expect(Math.min(...scores)).toBeCloseTo(0, 9);
      expect(Math.max(...scores)).toBeCloseTo(100, 9);
    }
  });

  it("negative growth is not clipped: Germany (-9.7%) is the population minimum and scores exactly 0", () => {
    expect(entity(c, "de").raw.growthPct).toBeLessThan(0);
    expect(entity(c, "de").scores.growth).toBeCloseTo(0, 9);
    expect(axis(c, "growth").min).toBeLessThan(0);
  });

  it("an entity's score does not depend on who else is selected", () => {
    const alone = buildComparison(dataset, { type: "market", ids: ["de", "cn"], period });
    for (const a of ["revenue", "growth", "attainment"] as const) expect(entity(alone, "de").scores[a]).toBeCloseTo(entity(c, "de").scores[a] ?? NaN, 9);
  });

  it("keeps the order of the requested ids and ignores unknown ids", () => {
    const x = buildComparison(dataset, { type: "market", ids: ["gb", "zz", "de"], period });
    expect(x.entities.map((e) => e.id)).toEqual(["gb", "de"]);
  });

  it("markets carry the supplied share snapshot (shown, never plotted)", () => {
    expect(entity(c, "de").sharePct).toBe(8.9);
  });
});

describe("regions", () => {
  const c = buildComparison(dataset, { type: "region", ids: ["eu", "apac"], period });
  it("normalises over the 4 regions and matches the audit; no share for regions", () => {
    expect(c.populationSize).toBe(4);
    expect(entity(c, "eu").raw.revenue).toBe(7057380);
    expect(entity(c, "apac").raw.growthPct).toBeCloseTo(audit.regionsLatest.apac?.growthPct ?? NaN, 2);
    expect(entity(c, "eu").sharePct).toBeNull();
    expect(entity(c, "apac").scores.revenue).toBeCloseTo(100, 9); // APAC is the largest region
    expect(axis(c, "revenue").min).toBe(1921495); // LATAM, not in the selection
  });
});

describe("period and degenerate cases", () => {
  it("the same entity gets different raw values and positions in a different period", () => {
    const march = buildComparison(dataset, { type: "market", ids: ["de"], period: "2026-03" });
    const may = buildComparison(dataset, { type: "market", ids: ["de"], period });
    expect(entity(march, "de").raw.revenue).toBe(metricsFor(dataset, { period: "2026-03", marketId: "de" }).actual);
    expect(entity(march, "de").raw.revenue).not.toBe(entity(may, "de").raw.revenue);
  });

  it("min equals max: every entity sits at the neutral 50 and the axis is flagged degenerate", () => {
    const flat = structuredClone(dataset);
    for (const f of flat.series) if (f.period === period) f.priorYear = f.actual; // every market grows exactly 0%
    const c = buildComparison(flat, { type: "market", ids: ["de", "us"], period });
    expect(axis(c, "growth").degenerate).toBe(true);
    expect(entity(c, "de").scores.growth).toBe(50);
    expect(entity(c, "us").scores.growth).toBe(50);
    expect(axis(c, "revenue").degenerate).toBe(false);
  });

  it("a missing value (zero prior year) has no score instead of a fake 0, and does not poison the bounds", () => {
    const holey = structuredClone(dataset);
    for (const f of holey.series) if (f.period === period && f.marketId === "us") f.priorYear = 0;
    const c = buildComparison(holey, { type: "market", ids: ["us", "de"], period });
    expect(entity(c, "us").raw.growthPct).toBeNull();
    expect(entity(c, "us").scores.growth).toBeNull();
    expect(Number.isFinite(axis(c, "growth").min)).toBe(true);
    expect(entity(c, "de").scores.growth).toBeCloseTo(0, 9);
  });
});
