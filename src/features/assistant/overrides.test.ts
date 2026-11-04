import { describe, expect, it } from "vitest";
import raw from "@/data/starter/data.json";
import overrides from "@/data/overrides/fixtures.local.json";
import starter from "@/data/starter/fixtures.json";
import { datasetSchema, metricsFor, portfolioHealth, statusCounts } from "@/domains/market";
import { formatPercent, formatUsdExact } from "@/shared/lib/format";

const dataset = datasetSchema.parse(raw);
const period = dataset.meta.latestPeriod;
const text = (id: string) => {
  const o = overrides.overrides.find((x) => x.id === id);
  if (!o) throw new Error(`no override ${id}`);
  return o.answer.text;
};
const market = (marketId: string, p = period) => metricsFor(dataset, { period: p, marketId });
const region = (regionId: string) => metricsFor(dataset, { period, regionId });
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const att = (m: { attainmentPct: number | null }) => formatPercent(m.attainmentPct);
const yoy = (m: { growthPct: number | null }) => formatPercent(m.growthPct, { signed: true });
const usd = (n: number) => formatUsdExact(Math.abs(n));
const unsigned = (s: string) => s.replace("−", "").replace("+", "");
const status = (id: string) => dataset.markets.find((m) => m.id === id)?.kpis.status;
const MINUS = "−";

describe("corrected fixture narratives state exactly what the dataset says", () => {
  it("at-risk: counts, which markets are in which group, and each figure next to its own market", () => {
    const t = text("at-risk");
    expect(statusCounts(dataset)).toEqual({ on_track: 7, at_risk: 4, off_track: 2 });
    expect(t).toMatch(/^Six markets are flagged/);
    expect(t).toContain("The other seven markets are on track");
    expect(["de", "es"].map(status)).toEqual(["off_track", "off_track"]);
    expect(["gb", "it", "br", "fr"].map(status)).toEqual(["at_risk", "at_risk", "at_risk", "at_risk"]);
    expect(t).toMatch(new RegExp(`Two are off track: Germany, at ${esc(att(market("de")))} of forecast and down ${esc(unsigned(yoy(market("de"))))} year on year`));
    expect(t).toMatch(new RegExp(`and Spain, which is ${esc(formatPercent((market("es").attainmentPct ?? 0) - 100))} above forecast but down ${esc(unsigned(yoy(market("es"))))} year on year`));
    expect(market("es").gap).toBeGreaterThan(0);
    expect(t).toMatch(new RegExp(`Four are at risk: the United Kingdom \\(${esc(att(market("gb")))} of forecast\\), Italy \\(${esc(att(market("it")))}\\), Brazil \\(${esc(att(market("br")))}\\) and France \\(${esc(att(market("fr")))}\\)`));
    for (const id of ["gb", "it", "br", "fr"]) expect(market(id).gap, id).toBeLessThan(0);
  });

  it("germany-dip: only supported facts, no causal claim about off-track status", () => {
    const t = text("germany-dip");
    const mar = market("de", "2026-03");
    const feb = market("de", "2026-02");
    expect(t).toContain(`to ${usd(mar.actual)}, down ${unsigned(formatPercent((mar.actual / feb.actual - 1) * 100))} from February and ${unsigned(yoy(mar))} below the prior year`);
    const growth = dataset.products.map((p) => metricsFor(dataset, { period: "2026-03", marketId: "de", productId: p.id }).growthPct ?? 0);
    expect(growth.every((g) => g < 0)).toBe(true);
    expect(`${Math.round(-Math.max(...growth))}% to ${Math.round(-Math.min(...growth))}%`).toBe("29% to 35%");
    expect(t).toContain("each down 29% to 35% year on year in March");
    const attainments = ["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05"].map((p) => market("de", p).attainmentPct ?? 0);
    expect(Math.min(...attainments)).toBeGreaterThan(91);
    expect(Math.max(...attainments)).toBeLessThan(93);
    expect(t).toContain("between 91% and 93% of forecast in every month from December 2025 to May 2026");
    expect(market("de", "2026-04").actual).toBeGreaterThan(mar.actual); // "recovered in April and May"
    expect(market("de", "2026-05").actual).toBeGreaterThan(mar.actual);
    expect(t).toContain(`is still ${unsigned(yoy(market("de")))} below the prior year in May`);
    expect(t).not.toMatch(/pulled|because|caused|due to|driven by|softening/i);
  });

  it("apac-vs-europe: each region's growth and attainment in its own clause", () => {
    const t = text("apac-vs-europe");
    expect(t).toContain(`APAC revenue is up ${unsigned(yoy(region("apac")))} year on year and sits at ${att(region("apac"))} of forecast`);
    expect(t).toContain(`Europe is up ${unsigned(yoy(region("eu")))} and sits at ${att(region("eu"))}, about ${(100 - (region("eu").attainmentPct ?? 0)).toFixed(1)} points under plan`);
    expect(t).toContain(`China (${att(market("cn"))} of forecast, up ${unsigned(yoy(market("cn")))}) and Japan (${att(market("jp"))}, up ${unsigned(yoy(market("jp")))}) lead APAC`);
    expect(t).toContain(`Germany (${att(market("de"))}), Italy (${att(market("it"))}), the United Kingdom (${att(market("gb"))}) and France (${att(market("fr"))}) are all under forecast`);
    for (const id of ["de", "it", "gb", "fr"]) expect(market(id).gap, id).toBeLessThan(0);
    expect(region("apac").growthPct ?? 0).toBeGreaterThan(region("eu").growthPct ?? 0);
    const apacMarkets = dataset.markets.filter((m) => m.regionId === "apac").map((m) => [m.id, market(m.id).actual] as const).sort((a, b) => b[1] - a[1]);
    expect(apacMarkets.slice(0, 2).map(([id]) => id).sort()).toEqual(["cn", "jp"]); // "lead APAC"
  });

  it("forecast-miss: no portfolio-level miss; every shortfall next to its own market or region", () => {
    const t = text("forecast-miss");
    const p = portfolioHealth(dataset).metrics;
    expect(p.gap).toBeGreaterThan(0);
    expect(t).toContain("no net forecast miss");
    expect(t).toContain(`revenue is ${usd(p.actual)} against a forecast of ${usd(p.forecast)}, which is ${att(p)} of plan`);
    expect(t).toContain(
      `Germany (${MINUS}${usd(market("de").gap)} versus forecast), the United Kingdom (${MINUS}${usd(market("gb").gap)}), Italy (${MINUS}${usd(market("it").gap)}), France (${MINUS}${usd(market("fr").gap)}) and Brazil (${MINUS}${usd(market("br").gap)})`,
    );
    for (const id of ["de", "gb", "it", "fr", "br"]) expect(market(id).gap, id).toBeLessThan(0);
    expect(t).toContain(`Europe is ${usd(region("eu").gap)} under forecast and LATAM ${usd(region("latam").gap)} under`);
    expect(t).toContain(`APAC (+${usd(region("apac").gap)}) and North America (+${usd(region("na").gap)})`);
    expect(region("eu").gap).toBeLessThan(0);
    expect(region("latam").gap).toBeLessThan(0);
    expect(region("apac").gap).toBeGreaterThan(0);
    expect(region("na").gap).toBeGreaterThan(0);
  });

  it("summary-long: totals, ranking and every regional and market claim in its own sentence", () => {
    const t = text("summary-long");
    const p = portfolioHealth(dataset).metrics;
    expect(t).toContain(`revenue is ${usd(p.actual)}, up ${unsigned(yoy(p))} year on year and ${att(p)} of forecast`);
    const ranked = dataset.markets.map((m) => [m.id, market(m.id).actual] as const).sort((a, b) => b[1] - a[1]);
    expect(ranked.slice(0, 3).map(([id]) => id)).toEqual(["cn", "us", "jp"]);
    expect(t).toContain(`China is the largest market (${usd(market("cn").actual)}) and is ${((market("cn").attainmentPct ?? 0) - 100).toFixed(1)}% ahead of forecast`);
    expect(t).toContain(`the United States (${usd(market("us").actual)}) and Japan (${usd(market("jp").actual)}) follow`);
    expect(t).toContain(`APAC is the growth region at ${yoy(region("apac"))} and ${att(region("apac"))} of forecast`);
    expect(t).toContain(`India (${yoy(market("in"))}, ${att(market("in"))} of forecast) is also ahead`);
    expect(market("in").gap).toBeGreaterThan(0);
    expect(t).toContain(`Australia is on plan (${att(market("au"))}) with modest growth (${yoy(market("au"))})`);
    expect(t).toContain(`North America is up ${unsigned(yoy(region("na")))} and at ${att(region("na"))} of forecast`);
    for (const id of ["us", "ca"]) expect(market(id).gap, id).toBeGreaterThan(0);
    expect(t).toContain(`Europe is the soft spot, up ${unsigned(yoy(region("eu")))} and at ${att(region("eu"))} of forecast`);
    expect(t).toContain(`still ${unsigned(yoy(market("de")))} below the prior year`);
    for (const id of ["it", "gb", "fr"]) expect(market(id).gap, id).toBeLessThan(0);
    expect(t).toContain(`Spain is above forecast but down ${unsigned(yoy(market("es")))} year on year`);
    expect(t).toContain(`LATAM is at ${att(region("latam"))} of forecast: Mexico is on plan and Brazil is ${(100 - (market("br").attainmentPct ?? 0)).toFixed(1)}% under it`);
    expect(market("mx").gap).toBeGreaterThan(0);
    expect(t).toContain("Six markets carry an at-risk or off-track flag: Germany, Spain, the United Kingdom, Italy, Brazil and France");
  });
});

describe("overrides only replace text and citations", () => {
  it("each override has exactly {id, reason, answer:{text, citations}} and targets an existing starter fixture", () => {
    const ids = new Set(starter.fixtures.map((f) => f.id));
    for (const o of overrides.overrides) {
      expect(ids.has(o.id), o.id).toBe(true);
      expect(Object.keys(o).sort()).toEqual(["answer", "id", "reason"]);
      expect(Object.keys(o.answer).sort()).toEqual(["citations", "text"]);
    }
  });
});
