import { describe, expect, it } from "vitest";
import raw from "@/data/starter/data.json";
import { childRows, datasetSchema, parseViewState, scopeLabel, scopeMetrics, selectInView, timeSeries } from "./index";

const dataset = datasetSchema.parse(raw);
const parse = (query: string) => parseViewState(new URLSearchParams(query), dataset);

describe("parseViewState normalization", () => {
  it("empty query is the portfolio view at the latest period and needs no rewrite", () => {
    const { state, canonical, needsNormalization } = parse("");
    expect(state).toMatchObject({ mode: "executive", region: null, market: null, product: null, period: "2026-05" });
    expect(canonical).toBe("");
    expect(needsNormalization).toBe(false);
  });

  it("restores a full drill path and period exactly", () => {
    const { state, needsNormalization } = parse("region=eu&market=de&product=veltrix&period=2026-03");
    expect(state).toMatchObject({ region: "eu", market: "de", product: "veltrix", period: "2026-03" });
    expect(needsNormalization).toBe(false);
  });

  it("drops an unknown market and normalizes to the portfolio", () => {
    const { state, canonical, needsNormalization } = parse("market=zz");
    expect(state.market).toBeNull();
    expect(canonical).toBe("");
    expect(needsNormalization).toBe(true);
  });

  it("a market implies its region and overrides a conflicting region", () => {
    const { state, canonical } = parse("region=na&market=de");
    expect(state.region).toBe("eu");
    expect(canonical).toBe("region=eu&market=de");
  });

  it("a market alone gains its region", () => {
    expect(parse("market=jp").state.region).toBe("apac");
  });

  it("a product without a market is dropped; an unknown product is dropped", () => {
    expect(parse("product=veltrix").state.product).toBeNull();
    expect(parse("market=de&product=nope").state.product).toBeNull();
  });

  it("an unknown region is dropped", () => {
    expect(parse("region=mars").state.region).toBeNull();
  });

  it("a period outside the dataset falls back to the latest period", () => {
    expect(parse("period=2030-01").state.period).toBe("2026-05");
    expect(parse("period=2026-13").state.period).toBe("2026-05");
    expect(parse("period=2026-03").state.period).toBe("2026-03");
  });

  it("invalid mode, metric and status are dropped; valid ones are kept", () => {
    const bad = parse("mode=boss&metric=vibes&status=great").state;
    expect(bad).toMatchObject({ mode: "executive", metric: "revenue", status: null });
    const good = parse("mode=analyst&metric=attainment&status=at_risk").state;
    expect(good).toMatchObject({ mode: "analyst", metric: "attainment", status: "at_risk" });
  });

  it("keeps a valid market comparison and removes duplicates", () => {
    const { state } = parse("compareType=market&compare=de,it,gb,de");
    expect(state.compareType).toBe("market");
    expect(state.compare).toEqual(["de", "it", "gb"]);
  });

  it("removes a comparison with fewer than two known ids", () => {
    expect(parse("compareType=market&compare=de").state.compare).toEqual([]);
    const { state, needsNormalization } = parse("compareType=market&compare=de,zz");
    expect(state).toMatchObject({ compareType: null, compare: [] });
    expect(needsNormalization).toBe(true);
  });

  it("removes a mixed-type comparison (region ids under compareType=market)", () => {
    expect(parse("compareType=market&compare=de,eu").state.compare).toEqual([]);
  });

  it("truncates a comparison to the first four ids", () => {
    expect(parse("compareType=market&compare=us,ca,de,gb,fr,it").state.compare).toEqual(["us", "ca", "de", "gb"]);
  });

  it("rewrites non-canonical order and unknown parameters (replace, not push)", () => {
    const { canonical, needsNormalization } = parse("period=2026-03&utm_source=x&region=eu");
    expect(canonical).toBe("region=eu&period=2026-03");
    expect(needsNormalization).toBe(true);
  });

  it("a canonical comparison URL is stable (no rewrite loop on the comma)", () => {
    const first = parse("compareType=region&compare=eu,apac");
    expect(first.canonical).toBe("compareType=region&compare=eu,apac");
    expect(first.needsNormalization).toBe(false);
    expect(parse(first.canonical).needsNormalization).toBe(false);
  });
});

describe("selectInView", () => {
  const start = parse("region=eu&market=de&product=veltrix&period=2026-03").state;

  it("selecting a region clears market and product but keeps the period", () => {
    const next = selectInView(start, { region: "na" }, dataset);
    expect(next).toMatchObject({ region: "na", market: null, product: null, period: "2026-03" });
  });

  it("selecting another market clears the product and follows the market's region", () => {
    const next = selectInView(start, { market: "jp" }, dataset);
    expect(next).toMatchObject({ region: "apac", market: "jp", product: null });
  });

  it("selecting null for the market returns to the region level", () => {
    const next = selectInView(start, { market: null }, dataset);
    expect(next).toMatchObject({ region: "eu", market: null, product: null });
  });

  it("changing the period keeps the drill path", () => {
    expect(selectInView(start, { period: "2025-01" }, dataset)).toMatchObject({ market: "de", period: "2025-01" });
  });
});

describe("scope selectors", () => {
  it("labels each level", () => {
    expect(scopeLabel(dataset, {})).toBe("Portfolio overview");
    expect(scopeLabel(dataset, { regionId: "eu" })).toBe("Europe");
    expect(scopeLabel(dataset, { regionId: "eu", marketId: "de" })).toBe("Germany");
    expect(scopeLabel(dataset, { regionId: "eu", marketId: "de", productId: "veltrix" })).toBe("Germany · Veltrix");
  });

  it("time series covers all 24 periods and the portfolio total matches the metrics", () => {
    const series = timeSeries(dataset, {});
    expect(series).toHaveLength(24);
    const last = series.at(-1);
    expect(last).toMatchObject({ period: "2026-05", actual: 22850419, forecast: 22748448 });
    expect(scopeMetrics(dataset, {}, "2026-05").actual).toBe(last?.actual);
  });

  it("Germany shows the March 2026 dip against February", () => {
    const series = timeSeries(dataset, { regionId: "eu", marketId: "de" });
    const mar = series.find((p) => p.period === "2026-03")?.actual ?? 0;
    const feb = series.find((p) => p.period === "2026-02")?.actual ?? 0;
    expect(mar / feb - 1).toBeLessThan(-0.2);
  });

  it("children: 4 regions, 3 EU markets... per level", () => {
    expect(childRows(dataset, {}, "2026-05").map((c) => c.kind)).toEqual(["region", "region", "region", "region"]);
    expect(childRows(dataset, { regionId: "eu" }, "2026-05").map((c) => c.id)).toEqual(["de", "gb", "fr", "it", "es"]);
    expect(childRows(dataset, { regionId: "eu", marketId: "de" }, "2026-05")).toHaveLength(5);
    expect(childRows(dataset, { regionId: "eu", marketId: "de", productId: "veltrix" }, "2026-05")).toEqual([]);
  });

  it("product-level series is a subset of the market series", () => {
    const market = scopeMetrics(dataset, { marketId: "de" }, "2026-03").actual;
    const product = scopeMetrics(dataset, { marketId: "de", productId: "veltrix" }, "2026-03").actual;
    expect(product).toBeGreaterThan(0);
    expect(product).toBeLessThan(market);
  });
});
