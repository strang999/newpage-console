import { describe, expect, it } from "vitest";
import { formatPercent } from "@/shared/lib/format";
import raw from "@/data/starter/data.json";
import { alertRuleInputSchema, alertRuleSchema, datasetSchema, displayOneDecimal, evaluateRule, THRESHOLD_BOUNDS, unknownMarketIds, type AlertRuleInput } from "./index";

const dataset = datasetSchema.parse(raw);
const valid: AlertRuleInput = { name: "Europe watch", scope: "all", marketIds: [], metric: "attainment", threshold: 95, enabled: true };
const issues = (input: unknown) => {
  const r = alertRuleInputSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("alertRuleInputSchema", () => {
  it("accepts a valid rule", () => expect(issues(valid)).toEqual([]));

  it.each([
    ["empty name", { name: "" }, "name: Name must be at least 2 characters"],
    ["one-character name", { name: "a" }, "name: Name must be at least 2 characters"],
    ["whitespace name", { name: "   " }, "name: Name must be at least 2 characters"],
    ["61-character name", { name: "x".repeat(61) }, "name: Name must be 60 characters or fewer"],
  ])("%s is rejected", (_n, patch, message) => expect(issues({ ...valid, ...patch })).toContain(message));

  it("trims the name", () => expect(alertRuleInputSchema.parse({ ...valid, name: "  Spain  " }).name).toBe("Spain"));

  it("an empty or non-numeric threshold is an error, never 0", () => {
    expect(issues({ ...valid, threshold: Number.NaN })).toEqual(["threshold: Enter a threshold"]);
    expect(issues({ ...valid, threshold: undefined })).toEqual(["threshold: Enter a threshold"]);
    expect(issues({ ...valid, threshold: "" })).toEqual(["threshold: Enter a threshold"]);
    expect(issues({ ...valid, threshold: Number.POSITIVE_INFINITY })).toEqual(["threshold: Enter a threshold"]);
    expect(issues({ ...valid, threshold: 0 })).toEqual(["threshold: Attainment threshold must be between 50% and 150%"]); // a real 0 is judged by the bounds, not as "empty"
    expect(issues({ ...valid, metric: "growth", threshold: 0 })).toEqual([]); // an actual 0 is a valid growth threshold
  });

  it.each([
    ["growth", -50.1, false],
    ["growth", -50, true],
    ["growth", 100, true],
    ["growth", 100.1, false],
    ["attainment", 49.9, false],
    ["attainment", 50, true],
    ["attainment", 150, true],
    ["attainment", 150.1, false],
  ] as const)("%s threshold %s is accepted: %s (bounds are explicit)", (metric, threshold, ok) => {
    expect(issues({ ...valid, metric, threshold }).length === 0).toBe(ok);
    expect(THRESHOLD_BOUNDS[metric].min).toBeLessThan(THRESHOLD_BOUNDS[metric].max);
  });

  it("a selected scope needs at least one market; scope 'all' ignores the list", () => {
    expect(issues({ ...valid, scope: "selected", marketIds: [] })).toEqual(["marketIds: Select at least one market"]);
    expect(issues({ ...valid, scope: "selected", marketIds: ["de"] })).toEqual([]);
    expect(issues({ ...valid, scope: "all", marketIds: [] })).toEqual([]);
  });

  it("rejects unknown metric or scope values", () => {
    expect(issues({ ...valid, metric: "revenue" }).length).toBeGreaterThan(0);
    expect(issues({ ...valid, scope: "some" }).length).toBeGreaterThan(0);
  });

  it("a stored rule needs an id and a timestamp", () => {
    expect(alertRuleSchema.safeParse({ ...valid, id: "a1", createdAt: "2026-11-04T00:00:00Z" }).success).toBe(true);
    expect(alertRuleSchema.safeParse(valid).success).toBe(false);
  });
});

describe("names and thresholds that look valid but are not", () => {
  it.each([
    ["two zero-width spaces", "\u200b\u200b"],
    ["zero-width joiners and a letter", "\u200d\u200da"],
    ["only no-break and em spaces", "\u00a0\u2003\u00a0"],
  ])("a name of %s is rejected as having fewer than 2 visible characters", (_n, name) => {
    expect(issues({ ...valid, name })).toEqual(["name: Name must be at least 2 characters"]);
  });

  it("accepts names with accents, emoji and CJK; 60 code points is the limit", () => {
    for (const name of ["\u00c9volution Ouest", "Ventes \ud83d\udcc9 Europe", "\u6b27\u6d32\u9884\u8b66"]) expect(issues({ ...valid, name }), name).toEqual([]);
    expect(issues({ ...valid, name: "\ud83d\udcc9".repeat(60) })).toEqual([]);
    expect(issues({ ...valid, name: "\ud83d\udcc9".repeat(61) })).toEqual(["name: Name must be 60 characters or fewer"]);
  });

  it.each([92.24, 92.21, 99.99999999, 70.05, 60.15])("a threshold of %s has more than one decimal and is rejected", (threshold) => {
    expect(issues({ ...valid, threshold })).toEqual(["threshold: Use at most one decimal place"]);
  });

  it.each([92.2, 95, 100.0, 50, 150, 70.1, 99.9])("a threshold of %s (one decimal at most) is accepted", (threshold) => {
    expect(issues({ ...valid, threshold })).toEqual([]);
  });

  it("0.1 steps that are not exact in binary (0.1 + 0.2, 1.1, 92.3) are still accepted", () => {
    for (const threshold of [0.1 + 0.2, 1.1, 92.3, 7.7]) expect(issues({ ...valid, metric: "growth", threshold })).toEqual([]);
  });
});

describe("displayOneDecimal matches what the UI prints, including negative ties", () => {
  it.each([
    [-2.25, -2.3],
    [2.25, 2.3],
    [-0.05, -0.1],
    [-0.04, 0],
    [-12.75, -12.8],
    [92.2395, 92.2],
    [0, 0],
  ])("%s -> %s", (input, shown) => expect(displayOneDecimal(input)).toBe(shown));

  it("agrees with formatPercent for every value on a 0.05 grid from -30 to +30 (ties included)", () => {
    for (let i = -600; i <= 600; i++) {
      const v = i * 0.05;
      const shown = displayOneDecimal(v);
      const printed = `${shown < 0 ? "\u2212" : ""}${Math.abs(shown).toFixed(1)}%`;
      expect(printed, String(v)).toBe(formatPercent(v));
    }
  });
});

describe("evaluateRule (latest period 2026-05)", () => {
  const period = "2026-05";
  const flagged = (rule: Parameters<typeof evaluateRule>[1]) =>
    evaluateRule(dataset, rule, period)
      .filter((e) => e.flagged)
      .map((e) => e.row.market.id)
      .sort();

  it("attainment below 95%: Germany, Italy and the UK (92.2, 93.8, 94.6)", () => {
    expect(flagged({ scope: "all", marketIds: [], metric: "attainment", threshold: 95 })).toEqual(["de", "gb", "it"]);
  });

  it("growth below 0%: Germany and Spain", () => {
    expect(flagged({ scope: "all", marketIds: [], metric: "growth", threshold: 0 })).toEqual(["de", "es"]);
  });

  it("a selected scope only evaluates the chosen markets", () => {
    const rows = evaluateRule(dataset, { scope: "selected", marketIds: ["de", "us"], metric: "attainment", threshold: 95 }, period);
    expect(rows.map((r) => r.row.market.id).sort()).toEqual(["de", "us"]);
    expect(rows.filter((r) => r.flagged).map((r) => r.row.market.id)).toEqual(["de"]);
  });

  it("'below' is strict and uses the displayed one-decimal value: a market at exactly the threshold is not flagged", () => {
    // Germany attainment is 92.2395...% and displays 92.2%
    expect(flagged({ scope: "selected", marketIds: ["de"], metric: "attainment", threshold: 92.2 })).toEqual([]);
    expect(flagged({ scope: "selected", marketIds: ["de"], metric: "attainment", threshold: 92.3 })).toEqual(["de"]);
  });

  it("a market without a value is never flagged", () => {
    const zero = structuredClone(dataset);
    for (const f of zero.series) if (f.marketId === "us" && f.period === period) f.priorYear = 0;
    const result = evaluateRule(zero, { scope: "selected", marketIds: ["us"], metric: "growth", threshold: 100 }, period);
    expect(result[0]?.value).toBeNull();
    expect(result[0]?.flagged).toBe(false);
  });

  it("follows the period", () => {
    const marchGerman = evaluateRule(dataset, { scope: "selected", marketIds: ["de"], metric: "growth", threshold: -20 }, "2026-03")[0];
    expect(marchGerman?.flagged).toBe(true); // -31% in March 2026
    expect(evaluateRule(dataset, { scope: "selected", marketIds: ["de"], metric: "growth", threshold: -20 }, period)[0]?.flagged).toBe(false);
  });
});

describe("unknownMarketIds", () => {
  it("reports ids that are not in the dataset", () => expect(unknownMarketIds(dataset, ["de", "zz", "us", "qq"])).toEqual(["zz", "qq"]));
});
