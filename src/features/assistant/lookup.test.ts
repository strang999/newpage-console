import { describe, expect, it } from "vitest";
import raw from "@/data/starter/data.json";
import { datasetSchema, scopeMetrics } from "@/domains/market";
import { formatPercent, formatUsdExact } from "@/shared/lib/format";
import { lookupAnswer } from "./lookup";

const d = datasetSchema.parse(raw);
const japan = scopeMetrics(d, { marketId: "jp", regionId: "apac" }, "2026-05");

describe("lookupAnswer", () => {
  it("answers 'find source data about japan' with Japan's figures from the dataset and one citation", () => {
    const a = lookupAnswer("find soucre data about japan");
    expect(a?.text).toContain("Japan, May 2026");
    expect(a?.text).toContain(formatUsdExact(japan.actual));
    expect(a?.text).toContain(formatPercent(japan.attainmentPct));
    expect(a?.citations).toEqual([{ marketId: "jp", period: "2026-05" }]);
  });

  it.each([
    ["about uk", "gb", "United Kingdom"],
    ["what about the UK?", "gb", "United Kingdom"],
    ["tell me about USA", "us", "United States"],
    ["numbers for DEU", "de", "Germany"],
    ["GERMANY!!", "de", "Germany"],
    ["  japan  ", "jp", "Japan"],
  ])("%s -> %s", (q, id, name) => {
    const a = lookupAnswer(q);
    expect(a?.citations[0]?.marketId).toBe(id);
    expect(a?.text).toContain(name);
  });

  it("capital US is the United States, and both markets of 'japan vs US' are answered", () => {
    expect(lookupAnswer("so what data you got for japan US")?.citations.map((c) => c.marketId)).toEqual(["jp", "us"]);
  });

  it("a region is cited by region, and 'North America' is not also read as the United States", () => {
    const a = lookupAnswer("show North America");
    expect(a?.citations).toEqual([{ regionId: "na", period: "2026-05" }]);
  });

  it("a product narrows the market to that product", () => {
    const a = lookupAnswer("Veltrix in Japan");
    expect(a?.citations).toEqual([{ marketId: "jp", productId: "veltrix", period: "2026-05" }]);
    expect(a?.text).toContain("Japan · Veltrix");
  });

  it("several entities are answered in order of mention, capped at four", () => {
    const a = lookupAnswer("japan, germany, france, spain, italy, brazil");
    expect(a?.citations.map((c) => c.marketId)).toEqual(["jp", "de", "fr", "es"]);
  });

  it("ordinary words that look like country codes are not entities", () => {
    expect(lookupAnswer("is it in the data and what is it")).toBeNull();
    expect(lookupAnswer("what is IT")).toBeNull(); // IT as in information technology, not Italy
    expect(lookupAnswer("IN or us?")).toBeNull();
    expect(lookupAnswer("tell us about it")).toBeNull();
    expect(lookupAnswer("hello")).toBeNull();
    expect(lookupAnswer("🙂")).toBeNull();
  });

  it("states figures only: no causal wording", () => {
    expect(lookupAnswer("about germany")?.text).not.toMatch(/because|due to|caused|driven by/i);
  });
});
