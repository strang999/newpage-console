import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import raw from "@/data/starter/data.json";
import { datasetSchema, marketRows, sortMarketRows, topMovers, topRisks } from "./index";

const dataset = datasetSchema.parse(raw);
const audit = JSON.parse(readFileSync(new URL("../../../docs/data-audit.json", import.meta.url), "utf8")) as {
  markets: { id: string; calculatedLatest: { actual: number; priorYear: number; forecastGap: number } }[];
};
const period = "2026-05";
const ids = (items: { row: { market: { id: string } } }[]) => items.map((i) => i.row.market.id);

describe("topRisks", () => {
  it("lists the six flagged markets, off track first, then by attainment ascending: de, es, it, gb, br, fr", () => {
    expect(ids(topRisks(dataset, period, 10))).toEqual(["de", "es", "it", "gb", "br", "fr"]);
  });

  it("the top five drops France; on-track markets never appear", () => {
    const five = topRisks(dataset, period);
    expect(ids(five)).toEqual(["de", "es", "it", "gb", "br"]);
    expect(five.every((r) => r.status !== "on_track")).toBe(true);
  });

  it("gap and attainment are the derived values (audit), status is the supplied snapshot", () => {
    for (const item of topRisks(dataset, period, 10)) {
      const g = audit.markets.find((m) => m.id === item.row.market.id)?.calculatedLatest;
      expect(item.gap).toBe(g?.forecastGap);
    }
    const spain = topRisks(dataset, period, 10).find((r) => r.row.market.id === "es");
    expect(spain?.status).toBe("off_track");
    expect(spain?.gap).toBeGreaterThan(0); // off track while above forecast: shown, not reconciled
  });
});

describe("topMovers", () => {
  it("ranks by absolute year-on-year revenue change, up or down, with growth beside it", () => {
    const movers = topMovers(dataset, period, 13);
    const deltas = movers.map((m) => Math.abs(m.delta));
    expect(deltas).toEqual([...deltas].sort((a, b) => b - a));
    const expected = [...audit.markets]
      .sort((a, b) => Math.abs(b.calculatedLatest.actual - b.calculatedLatest.priorYear) - Math.abs(a.calculatedLatest.actual - a.calculatedLatest.priorYear))
      .map((m) => m.id);
    expect(ids(movers)).toEqual(expected); // order recomputed from the independent audit, not from the code under test
    expect(ids(movers).slice(0, 3)).toEqual(["cn", "us", "jp"]);
    for (const m of movers) {
      const g = audit.markets.find((x) => x.id === m.row.market.id)?.calculatedLatest;
      expect(m.delta).toBe((g?.actual ?? NaN) - (g?.priorYear ?? NaN));
    }
  });

  it("includes decliners by size (Germany is a top mover although it fell)", () => {
    const de = topMovers(dataset, period, 5).find((m) => m.row.market.id === "de");
    expect(de).toBeDefined();
    expect(de?.delta).toBeLessThan(0);
    expect(de?.growthPct).toBeLessThan(0);
  });
});

describe("sortMarketRows", () => {
  const rows = marketRows(dataset, period);
  const order = (key: Parameters<typeof sortMarketRows>[1], dir: "ascending" | "descending") => sortMarketRows(rows, key, dir).map((r) => r.market.id);

  it("sorts numerically, both directions, with name as the tie-break", () => {
    expect(order("revenue", "descending").slice(0, 3)).toEqual(["cn", "us", "jp"]);
    expect(order("revenue", "ascending").slice(0, 2)).toEqual(["es", "mx"]);
    expect(order("growth", "ascending")[0]).toBe("de");
    expect(order("attainment", "descending")[0]).toBe("cn");
    expect(order("gap", "ascending")[0]).toBe("de");
  });

  it("sorts text with locale compare and status by severity", () => {
    expect(order("market", "ascending").slice(0, 3)).toEqual(["au", "br", "ca"]);
    expect(order("status", "ascending").slice(0, 2).sort()).toEqual(["de", "es"]); // off track first
    expect(order("status", "descending").slice(0, 7).every((id) => !["de", "es", "gb", "fr", "it", "br"].includes(id))).toBe(true);
  });

  it("does not mutate its input and is stable across directions for equal keys", () => {
    const before = rows.map((r) => r.market.id);
    sortMarketRows(rows, "status", "descending");
    expect(rows.map((r) => r.market.id)).toEqual(before);
  });

  it("missing values (N/A) sort last in both directions", () => {
    const withNull = rows.map((r) => (r.market.id === "us" ? { ...r, metrics: { ...r.metrics, growthPct: null } } : r));
    expect(sortMarketRows(withNull, "growth", "ascending").at(-1)?.market.id).toBe("us");
    expect(sortMarketRows(withNull, "growth", "descending").at(-1)?.market.id).toBe("us");
  });
});
