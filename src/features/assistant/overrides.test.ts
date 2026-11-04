import { describe, expect, it } from "vitest";
import raw from "@/data/starter/data.json";
import overrides from "@/data/overrides/fixtures.local.json";
import { datasetSchema, metricsFor, portfolioHealth, statusCounts } from "@/domains/market";
import { formatPercent, formatUsdExact } from "@/shared/lib/format";

const dataset = datasetSchema.parse(raw);
const period = dataset.meta.latestPeriod;
const text = (id: string) => {
  const o = overrides.overrides.find((x) => x.id === id);
  if (!o) throw new Error(`no override ${id}`);
  return o.answer.text;
};
const market = (marketId: string) => metricsFor(dataset, { period, marketId });
const region = (regionId: string) => metricsFor(dataset, { period, regionId });
const att = (m: { attainmentPct: number | null }) => formatPercent(m.attainmentPct);
const yoy = (m: { growthPct: number | null }) => formatPercent(m.growthPct);
const usd = (n: number) => formatUsdExact(Math.abs(n));

describe("corrected fixture narratives state exactly what the dataset says", () => {
  it("at-risk: six flagged markets (2 off track, 4 at risk) with their attainment", () => {
    const t = text("at-risk");
    const counts = statusCounts(dataset);
    expect(counts).toEqual({ on_track: 7, at_risk: 4, off_track: 2 });
    expect(t).toContain("Six markets");
    for (const id of ["de", "gb", "it", "br", "fr"]) expect(t, id).toContain(att(market(id)));
    expect(t).toContain(`down ${yoy(market("de")).replace("\u2212", "")} year on year`);
    expect(t).toContain(`${formatPercent((market("es").attainmentPct ?? 0) - 100)} above forecast`);
    expect(t).toContain(`down ${yoy(market("es")).replace("\u2212", "")} year on year`);
    const status = (id: string) => dataset.markets.find((m) => m.id === id)?.kpis.status;
    expect([status("de"), status("es")]).toEqual(["off_track", "off_track"]);
    expect(["gb", "it", "br", "fr"].map(status)).toEqual(["at_risk", "at_risk", "at_risk", "at_risk"]);
  });

  it("apac-vs-europe: region growth and attainment", () => {
    const t = text("apac-vs-europe");
    expect(t).toContain(`up ${yoy(region("apac"))} year on year`);
    expect(t).toContain(att(region("apac")));
    expect(t).toContain(`up ${yoy(region("eu"))}`);
    expect(t).toContain(att(region("eu")));
    expect(t).toContain(`${(100 - (region("eu").attainmentPct ?? 0)).toFixed(1)} points under plan`);
    for (const id of ["cn", "jp", "de", "it", "gb", "fr"]) expect(t, id).toContain(att(market(id)));
    // every market named as "under forecast" really is under forecast
    for (const id of ["de", "it", "gb", "fr"]) expect(market(id).gap).toBeLessThan(0);
  });

  it("forecast-miss: no portfolio-level miss, shortfalls by market and region", () => {
    const t = text("forecast-miss");
    const p = portfolioHealth(dataset).metrics;
    expect(p.gap).toBeGreaterThan(0); // there is no net miss
    expect(t).toContain("no net forecast miss");
    expect(t).toContain(usd(p.actual));
    expect(t).toContain(usd(p.forecast));
    expect(t).toContain(att(p));
    for (const id of ["de", "gb", "it", "fr", "br"]) {
      expect(market(id).gap, id).toBeLessThan(0);
      expect(t, id).toContain(`\u2212${usd(market(id).gap)}`);
    }
    expect(t).toContain(`Europe is ${usd(region("eu").gap)} under`);
    expect(t).toContain(`LATAM ${usd(region("latam").gap)} under`);
    expect(t).toContain(`APAC (+${usd(region("apac").gap)})`);
    expect(t).toContain(`North America (+${usd(region("na").gap)})`);
  });

  it("summary-long: totals, the largest market and the on/under-plan claims", () => {
    const t = text("summary-long");
    const p = portfolioHealth(dataset).metrics;
    expect(t).toContain(usd(p.actual));
    expect(t).toContain(`up ${yoy(p)} year on year`);
    expect(t).toContain(att(p));
    const byRevenue = dataset.markets.map((m) => [m.id, market(m.id).actual] as const).sort((a, b) => b[1] - a[1]);
    expect(byRevenue.slice(0, 3).map(([id]) => id)).toEqual(["cn", "us", "jp"]); // China is the largest, not the US
    for (const id of ["cn", "us", "jp"]) expect(t, id).toContain(usd(market(id).actual));
    expect(t).toContain(`${((market("cn").attainmentPct ?? 0) - 100).toFixed(1)}% ahead of forecast`);
    for (const id of ["it", "gb", "fr"]) expect(market(id).gap, id).toBeLessThan(0); // "under forecast"
    expect(t).toContain(att(region("eu")));
    expect(t).toContain(att(region("latam")));
    expect(t).toContain(att(region("apac")));
    expect(t).toContain(att(region("na")));
    expect(t).toContain(`${(100 - (market("br").attainmentPct ?? 0)).toFixed(1)}% under it`);
  });

  it("originals are unchanged: only text and citations are overridden, ids exist in the starter fixtures", async () => {
    const starter = (await import("@/data/starter/fixtures.json")).default;
    const ids = new Set(starter.fixtures.map((f) => f.id));
    for (const o of overrides.overrides) expect(ids.has(o.id), o.id).toBe(true);
    expect(Object.keys(overrides.overrides[0]?.answer ?? {}).sort()).toEqual(["citations", "text"]);
  });
});
