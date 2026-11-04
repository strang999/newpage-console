import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import raw from "@/data/starter/data.json";
import { buildMapScale, datasetSchema, marketRows, numericIdForIso3 } from "./index";

const dataset = datasetSchema.parse(raw);
const rows = marketRows(dataset, dataset.meta.latestPeriod);
const byId = (id: string) => {
  const r = rows.find((x) => x.market.id === id);
  if (!r) throw new Error(id);
  return r;
};

describe("iso3 -> numeric geometry id", () => {
  const topology = JSON.parse(readFileSync(new URL("../../../node_modules/world-atlas/countries-110m.json", import.meta.url), "utf8")) as {
    objects: { countries: { geometries: { id: string; properties: { name: string } }[] } };
  };
  const geometries = topology.objects.countries.geometries;

  it("all 13 markets resolve to exactly one geometry in the shipped TopoJSON", () => {
    expect(dataset.markets).toHaveLength(13);
    for (const m of dataset.markets) {
      const id = numericIdForIso3(m.iso3);
      expect(id, m.iso3).not.toBeNull();
      expect(geometries.filter((g) => String(g.id) === id), `${m.iso3} -> ${id}`).toHaveLength(1);
    }
  });

  it("maps to the right country (sanity check on names)", () => {
    const name = (iso3: string) => geometries.find((g) => String(g.id) === numericIdForIso3(iso3))?.properties.name;
    expect(name("DEU")).toBe("Germany");
    expect(name("USA")).toBe("United States of America");
    expect(name("CHN")).toBe("China");
    expect(name("AUS")).toBe("Australia");
  });

  it("is case-insensitive and returns null for unknown codes", () => {
    expect(numericIdForIso3("deu")).toBe("276");
    expect(numericIdForIso3("XXX")).toBeNull();
  });
});

describe("map scales", () => {
  it("growth: fixed bins classify on the displayed one-decimal value", () => {
    const s = buildMapScale("growth", rows);
    expect(s.classes.map((c) => c.label)).toEqual(["Below −5%", "−5% to 0%", "0% to 5%", "5% to 10%", "10% and above"]);
    expect(s.classify(byId("de"))).toBe(0); // -9.7
    expect(s.classify(byId("es"))).toBe(1); // -4.6
    expect(s.classify(byId("it"))).toBe(2); // +0.3
    expect(s.classify(byId("jp"))).toBe(3); // +9.7
    expect(s.classify(byId("cn"))).toBe(4); // +18.2
    expect(s.classify(byId("us"))).toBe(4); // 9.991 displays as +10.0%, so it belongs to "10% and above"
    expect(s.valueText(byId("us"))).toBe("+10.0%");
  });

  it("attainment: bins are centred on plan (100%)", () => {
    const s = buildMapScale("attainment", rows);
    expect(s.classes.map((c) => c.label)).toEqual(["Below 95%", "95% to 98%", "98% to 102%", "102% to 105%", "105% and above"]);
    expect(s.classify(byId("de"))).toBe(0); // 92.2
    expect(s.classify(byId("br"))).toBe(1); // 95.5
    expect(s.classify(byId("us"))).toBe(2); // 100.6
    expect(s.classify(byId("jp"))).toBe(3); // 104.2
    expect(s.classify(byId("cn"))).toBe(4); // 106.6
  });

  it("revenue: five equal-width bins across the markets shown, lowest and highest land in the end classes", () => {
    const s = buildMapScale("revenue", rows);
    expect(s.classes).toHaveLength(5);
    const sorted = [...rows].sort((a, b) => a.metrics.actual - b.metrics.actual);
    expect(s.classify(sorted[0] ?? byId("mx"))).toBe(0);
    expect(s.classify(sorted.at(-1) ?? byId("cn"))).toBe(4);
    expect(s.valueText(byId("cn"))).toBe("$3.78M");
    const used = new Set(rows.map((r) => s.classify(r)));
    expect(used.has(0) && used.has(4)).toBe(true);
  });

  it("status is categorical and sourced from the supplied snapshot", () => {
    const s = buildMapScale("status", rows);
    expect(s.kind).toBe("categorical");
    expect(s.source).toBe("supplied_snapshot");
    expect(s.classes.map((c) => c.label)).toEqual(["On track", "At risk", "Off track"]);
    expect([byId("us"), byId("gb"), byId("de")].map((r) => s.classify(r))).toEqual([0, 1, 2]);
    expect(rows.filter((r) => s.classify(r) === 0)).toHaveLength(7);
    expect(rows.filter((r) => s.classify(r) === 1)).toHaveLength(4);
    expect(rows.filter((r) => s.classify(r) === 2)).toHaveLength(2);
  });

  it("a market with no value for the metric is unclassified (No data), not class 0", () => {
    const noGrowth = { ...byId("us"), metrics: { ...byId("us").metrics, growthPct: null, attainmentPct: null } };
    expect(buildMapScale("growth", rows).classify(noGrowth)).toBeNull();
    expect(buildMapScale("attainment", rows).classify(noGrowth)).toBeNull();
    expect(buildMapScale("growth", rows).valueText(noGrowth)).toBe("N/A");
  });

  it("derived metrics are labelled derived", () => {
    for (const m of ["revenue", "growth", "attainment"] as const) expect(buildMapScale(m, rows).source).toBe("derived");
  });
});
