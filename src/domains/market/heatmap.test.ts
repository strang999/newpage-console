import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import raw from "@/data/starter/data.json";
import { buildHeatmap, classifyGap, datasetSchema, describeCell, formatGapPts, HEATMAP_BOUNDS, HEATMAP_CLASSES, metricsFor } from "./index";

const dataset = datasetSchema.parse(raw);
const audit = JSON.parse(readFileSync(new URL("../../../docs/data-audit.json", import.meta.url), "utf8")) as {
  markets: { id: string; calculatedLatest: { forecastAttainmentPct: number } }[];
  germanyEarly2026: Record<string, { forecastAttainmentPct: number }>;
};

function cell(h: ReturnType<typeof buildHeatmap>, market: string, period: string) {
  const r = h.rows.findIndex((x) => x.marketId === market);
  const c = h.periods.indexOf(period);
  const found = h.cells[r]?.[c];
  if (!found) throw new Error(`${market} ${period}`);
  return found;
}

describe("buildHeatmap", () => {
  it("portfolio level: 13 markets x 24 periods", () => {
    const h = buildHeatmap(dataset, { regionId: null });
    expect(h.rows).toHaveLength(13);
    expect(h.periods).toHaveLength(24);
    expect(h.cells).toHaveLength(13);
    expect(h.cells.every((row) => row.length === 24)).toBe(true);
  });

  it("a region shows its sibling markets, not a single row (Europe: de, gb, fr, it, es)", () => {
    const h = buildHeatmap(dataset, { regionId: "eu" });
    expect(h.rows.map((r) => r.marketId)).toEqual(["de", "gb", "fr", "it", "es"]);
    expect(h.cells).toHaveLength(5);
  });

  it("the latest column matches the audit's attainment for every market", () => {
    const h = buildHeatmap(dataset, { regionId: null });
    for (const m of audit.markets) {
      expect(cell(h, m.id, "2026-05").attainmentPct).toBeCloseTo(m.calculatedLatest.forecastAttainmentPct, 6);
    }
  });

  it("Germany Jan-Mar 2026 matches the audit's monthly attainment; the value is attainment minus 100", () => {
    const h = buildHeatmap(dataset, { regionId: "eu" });
    for (const p of ["2026-01", "2026-02", "2026-03"]) {
      const c = cell(h, "de", p);
      expect(c.attainmentPct).toBeCloseTo(audit.germanyEarly2026[p]?.forecastAttainmentPct ?? NaN, 6);
      expect(c.gapPts).toBeCloseTo((c.attainmentPct ?? NaN) - 100, 9);
    }
    expect(describeCell("Germany", cell(h, "de", "2026-03"))).toBe("Germany, Mar 2026: 92.2% of forecast, 7.8 points under forecast");
  });

  it("every cell equals the independent per-market metric for its month", () => {
    const h = buildHeatmap(dataset, { regionId: null });
    for (const [ri, row] of h.rows.entries()) {
      for (const [ci, period] of h.periods.entries()) {
        const expected = metricsFor(dataset, { period, marketId: row.marketId }).attainmentPct;
        expect(h.cells[ri]?.[ci]?.attainmentPct).toBeCloseTo(expected ?? NaN, 9);
      }
    }
  });

  it("every class is used somewhere (the bins are not wasted) and values span about -9 to +7 points", () => {
    const h = buildHeatmap(dataset, { regionId: null });
    const flat = h.cells.flat();
    expect(new Set(flat.map((c) => c.cls)).size).toBe(HEATMAP_CLASSES.length);
    const gaps = flat.map((c) => c.gapPts ?? 0);
    expect(Math.min(...gaps)).toBeGreaterThan(-10);
    expect(Math.max(...gaps)).toBeLessThan(8);
  });
});

describe("classification", () => {
  it("classifies on the displayed one-decimal value at every bound, and the bounds are the ones the legend states", () => {
    expect(HEATMAP_BOUNDS).toEqual([-6, -2, 2, 6]);
    const labelBounds = HEATMAP_CLASSES.slice(1).map((c) => Number(/^([−+]?\d+)/.exec(c.label)?.[1]?.replace("−", "-")));
    expect(labelBounds).toEqual([-6, -2, 2, 6]);
    const shownAt = (v: number) => Math.round(v * 10) / 10;
    for (const v of [-9, -6.06, -6.04, -6, -2.06, -2.04, -2, -0.4, 0, 1.94, 1.96, 2, 5.94, 5.96, 6, 9]) {
      expect(classifyGap(v), String(v)).toBe(labelBounds.filter((b) => shownAt(v) >= b).length);
    }
    expect(classifyGap(-6.04)).toBe(1); // displays -6.0, which belongs to "-6 to under -2"
    expect(classifyGap(-6.06)).toBe(0); // displays -6.1
    expect(classifyGap(1.96)).toBe(3); // displays +2.0, which belongs to "+2 to under +6"
    expect(classifyGap(null)).toBeNull();
  });

  it("formats with a true minus sign and an explicit plus", () => {
    expect(formatGapPts(-7.84)).toBe("−7.8");
    expect(formatGapPts(2.26)).toBe("+2.3");
    expect(formatGapPts(0.02)).toBe("0.0");
    expect(formatGapPts(null)).toBe("N/A");
  });

  it("a cell without a forecast has no class and says so", () => {
    expect(describeCell("X", { marketId: "x", period: "2026-03", gapPts: null, attainmentPct: null, cls: null })).toBe("X, Mar 2026: no forecast");
  });
});
