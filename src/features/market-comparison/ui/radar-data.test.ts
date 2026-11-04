import { describe, expect, it } from "vitest";
import raw from "@/data/starter/data.json";
import { buildComparison, datasetSchema } from "@/domains/market";
import { radarData } from "./radar-data";

const dataset = datasetSchema.parse(raw);

describe("radarData", () => {
  it("one row per axis with the entity's 0-100 position under its id", () => {
    const c = buildComparison(dataset, { type: "market", ids: ["de", "cn"], period: "2026-05" });
    const rows = radarData(c);
    expect(rows.map((r) => r.axis)).toEqual(["Revenue", "YoY growth", "Forecast attainment"]);
    expect(rows[1]?.de).toBeCloseTo(0, 9); // Germany has the lowest growth
    expect(rows[1]?.cn).toBeCloseTo(100, 9); // China the highest
  });

  it("follows the period: the same entity is drawn at a different position in another period", () => {
    const may = radarData(buildComparison(dataset, { type: "market", ids: ["de", "it"], period: "2026-05" }));
    const mar = radarData(buildComparison(dataset, { type: "market", ids: ["de", "it"], period: "2026-03" }));
    expect(mar[0]?.de).not.toBe(may[0]?.de);
  });

  it("a missing value stays null instead of being drawn as 0", () => {
    const holey = structuredClone(dataset);
    for (const f of holey.series) if (f.period === "2026-05" && f.marketId === "us") f.priorYear = 0;
    const rows = radarData(buildComparison(holey, { type: "market", ids: ["us", "de"], period: "2026-05" }));
    expect(rows[1]?.us).toBeNull();
    expect(typeof rows[1]?.de).toBe("number");
  });
});
