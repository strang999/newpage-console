import { describe, expect, it } from "vitest";
import raw from "@/data/starter/data.json";
import { buildMapScale, datasetSchema, displayOneDecimal, marketRows, type MapMetric, type MarketRow } from "./index";

const dataset = datasetSchema.parse(raw);
const rows = marketRows(dataset, dataset.meta.latestPeriod);
const byId = (id: string) => {
  const r = rows.find((x) => x.market.id === id);
  if (!r) throw new Error(id);
  return r;
};

describe("map scales", () => {
  it("growth: fixed bins classify on the displayed one-decimal value", () => {
    const s = buildMapScale("growth", rows);
    expect(s.classes.map((c) => c.label)).toEqual(["Under −5%", "−5% to under 0%", "0% to under 5%", "5% to under 10%", "10% and above"]);
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
    expect(s.classes.map((c) => c.label)).toEqual(["Under 95%", "95% to under 98%", "98% to under 102%", "102% to under 105%", "105% and above"]);
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

/** Lower bounds read back from the labels, so the legend text and the classification can never drift apart. */
function boundsFromLabels(labels: readonly string[]): number[] {
  return labels
    .slice(1)
    .map((l) => /^(\u2212?\d+)%/.exec(l)?.[1])
    .map((n) => Number((n ?? "").replace("\u2212", "-")));
}
const displayed = displayOneDecimal;
const withMetrics = (row: MarketRow, patch: Partial<MarketRow["metrics"]>): MarketRow => ({ ...row, metrics: { ...row.metrics, ...patch } });

describe("class boundaries agree with the legend labels", () => {
  it.each([
    ["growth", "growthPct", [-5.04, -5, -4.95, -0.05, 0, 0.04, 4.95, 5, 9.95, 10, 10.04]],
    ["attainment", "attainmentPct", [94.95, 95, 95.04, 97.95, 98, 101.95, 102, 104.95, 105, 105.04]],
  ] as const)("%s: every value at or around a bound lands in the class its label says", (metric, field, values) => {
    const scale = buildMapScale(metric as MapMetric, rows);
    const bounds = boundsFromLabels(scale.classes.map((c) => c.label));
    expect(bounds).toHaveLength(4);
    for (const v of values) {
      const expected = bounds.filter((b) => displayed(v) >= b).length;
      expect(scale.classify(withMetrics(byId("us"), { [field]: v })), `${metric} ${v}`).toBe(expected);
    }
  });

  it("scanned over all 24 periods, every market's displayed growth and attainment is in the class its label states", () => {
    for (const metric of ["growth", "attainment"] as const) {
      for (const period of dataset.meta.periods) {
        const periodRows = marketRows(dataset, period);
        const scale = buildMapScale(metric, periodRows);
        const bounds = boundsFromLabels(scale.classes.map((c) => c.label));
        for (const row of periodRows) {
          const v = metric === "growth" ? row.metrics.growthPct : row.metrics.attainmentPct;
          if (v === null) continue;
          expect(scale.classify(row), `${metric} ${period} ${row.market.id} ${v}`).toBe(bounds.filter((b) => displayed(v) >= b).length);
        }
      }
    }
  });

  it("labels use half-open ranges, so a shared bound belongs to exactly one class", () => {
    const labels = buildMapScale("growth", rows).classes.map((c) => c.label);
    expect(labels.filter((l) => l.includes("10%"))).toEqual(["5% to under 10%", "10% and above"]);
  });

  it("revenue edges: a value exactly at an edge goes up, and the labels say 'under' the edge", () => {
    const s = buildMapScale("revenue", rows);
    expect(s.classes[0]?.label).toMatch(/^Under \$/);
    expect(s.classes[4]?.label).toMatch(/and above$/);
    expect(s.classes.slice(1, 4).every((c) => /^\$[\d.]+M to under \$[\d.]+M$/.test(c.label))).toBe(true);
    const min = Math.min(...rows.map((r) => r.metrics.actual));
    const max = Math.max(...rows.map((r) => r.metrics.actual));
    const step = (max - min) / 5;
    expect(s.classify(withMetrics(byId("us"), { actual: min + step }))).toBe(1);
    expect(s.classify(withMetrics(byId("us"), { actual: min + step - 1 }))).toBe(0);
    expect(s.classify(withMetrics(byId("us"), { actual: min + 4 * step }))).toBe(4);
  });
});
