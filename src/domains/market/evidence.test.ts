import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import raw from "@/data/starter/data.json";
import fixtures from "@/data/starter/fixtures.json";
import { datasetSchema, resolveCitation, type ResolvedEvidence } from "./index";

const dataset = datasetSchema.parse(raw);

function resolved(e: ResolvedEvidence) {
  if (e.status !== "resolved") throw new Error(`expected resolved, got: ${e.reason}`);
  return e;
}

describe("resolveCitation", () => {
  it("de / veltrix / 2026-03 resolves to exact series values and a full dashboard target", () => {
    const e = resolved(resolveCitation(dataset, { marketId: "de", productId: "veltrix", period: "2026-03" }));
    expect(e.title).toBe("Germany · Veltrix · Mar 2026");
    expect(e.target).toEqual({ region: "eu", market: "de", product: "veltrix", period: "2026-03" });
    const row = dataset.series.find((f) => f.marketId === "de" && f.productId === "veltrix" && f.period === "2026-03");
    expect(row).toBeDefined();
    expect(e.metrics.actual).toBe(row?.actual);
    expect(e.metrics.forecast).toBe(row?.forecast);
    expect(e.metrics.priorYear).toBe(row?.priorYear);
    expect(e.previous?.period).toBe("2026-02");
    expect(e.snapshot).toBeNull(); // snapshot share/status exist per market, not per product
  });

  it("a market citation carries the supplied snapshot (status, share, anomalies) separately from derived values", () => {
    const e = resolved(resolveCitation(dataset, { marketId: "de", period: "2026-03" }));
    expect(e.snapshot).toMatchObject({ status: "off_track", sharePct: 8.9 });
    expect(e.snapshot?.anomalies).toEqual([{ period: "2026-03", note: "Revenue fell 27% versus the prior month." }]);
    expect(e.target).toEqual({ region: "eu", market: "de", product: null, period: "2026-03" });
  });

  it("a region citation sums its markets and targets the region", () => {
    const e = resolved(resolveCitation(dataset, { regionId: "eu", period: "2026-05" }));
    expect(e.metrics.actual).toBe(7057380);
    expect(e.target).toEqual({ region: "eu", market: null, product: null, period: "2026-05" });
  });

  it("a missing period falls back to the latest period and says so", () => {
    const e = resolved(resolveCitation(dataset, { marketId: "jp" }));
    expect(e.period).toBe("2026-05");
    expect(e.notes[0]).toMatch(/latest period \(May 2026\)/);
  });

  it("the first period has no previous month", () => {
    expect(resolved(resolveCitation(dataset, { marketId: "us", period: "2024-06" })).previous).toBeNull();
  });

  it("a product without a market cannot be opened as a product view and says so", () => {
    const e = resolved(resolveCitation(dataset, { productId: "veltrix", period: "2026-05" }));
    expect(e.target.product).toBeNull();
    expect(e.notes.join(" ")).toMatch(/needs a market/);
    expect(e.metrics.actual).toBeGreaterThan(0);
  });

  it.each([
    [{ marketId: "zz", period: "2026-05" }, /Unknown market/],
    [{ regionId: "mars" }, /Unknown region/],
    [{ marketId: "de", productId: "nope" }, /Unknown product/],
    [{ marketId: "de", period: "2030-01" }, /outside the dataset/],
    [{ marketId: "de", regionId: "na" }, /not in/],
  ])("%j is unresolved, with a reason", (citation, reason) => {
    const e = resolveCitation(dataset, citation);
    expect(e.status).toBe("unresolved");
    expect(e.status === "unresolved" && e.reason).toMatch(reason);
  });
});

describe("every supplied and overridden citation resolves", () => {
  const overrides = JSON.parse(readFileSync(new URL("../../../data/overrides/fixtures.local.json", import.meta.url), "utf8")) as {
    overrides: { id: string; answer: { citations?: object[] } }[];
  };
  const all = [
    ...fixtures.fixtures.flatMap((f) => f.answer.citations as object[]),
    ...fixtures.default.answer.citations,
    ...overrides.overrides.flatMap((o) => o.answer.citations ?? []),
  ];
  it("has no unresolved reference", () => {
    expect(all.length).toBeGreaterThan(10);
    for (const c of all) expect(resolveCitation(dataset, c).status).toBe("resolved");
  });
});
