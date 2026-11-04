import { describe, expect, it } from "vitest";
import raw from "@/data/starter/data.json";
import { datasetSchema } from "./schema";
import { decodeDataset, encodeDataset } from "./wire";

const d = datasetSchema.parse(raw);

describe("dataset wire format", () => {
  it("round-trips every fact exactly, in order", () => {
    const back = decodeDataset(encodeDataset(d));
    expect(back).toEqual(d);
    expect(back.series).toHaveLength(1560);
  });

  it("is much smaller on the wire than the object form", () => {
    const wire = JSON.stringify(encodeDataset(d)).length;
    const full = JSON.stringify(d).length;
    expect(wire).toBeLessThan(full * 0.6);
  });

  it("refuses a fact that points at nothing, and a truncated or corrupted list, instead of guessing", () => {
    expect(() => encodeDataset({ ...d, series: [{ ...(d.series[0] as (typeof d.series)[number]), marketId: "zz" }] })).toThrow(/unknown market/);
    const wire = encodeDataset(d);
    expect(() => decodeDataset({ ...wire, series: [99, 0, 0, 1, 1, 1, 1] })).toThrow(/malformed/);
    expect(() => decodeDataset({ ...wire, series: wire.series.slice(0, 7 * 3 + 2) })).toThrow(/malformed/); // a cut-off row is an error, not a shorter dataset
  });
});
