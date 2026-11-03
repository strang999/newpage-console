import { describe, expect, it } from "vitest";
import { formatInteger, formatPercent, formatPeriod, formatUsdCompact, formatUsdExact } from "./format";

describe("format", () => {
  it.each([
    [22850419, "$22.85M"],
    [1676586, "$1.68M"],
    [950, "$950.00"],
    [null, "N/A"],
  ])("formatUsdCompact(%s) = %s", (input, out) => expect(formatUsdCompact(input)).toBe(out));

  it.each([
    [22850419, "$22,850,419"],
    [0, "$0"],
    [null, "N/A"],
  ])("formatUsdExact(%s) = %s", (input, out) => expect(formatUsdExact(input)).toBe(out));

  it.each([
    [7.3059, undefined, "7.3%"],
    [7.3059, { signed: true }, "+7.3%"],
    [100.448, undefined, "100.4%"],
    [-9.7268, { signed: true }, "−9.7%"],
    [-0.04, { signed: true }, "0.0%"],
    [0, { signed: true }, "0.0%"],
    [null, undefined, "N/A"],
    [Number.NaN, undefined, "N/A"],
  ] as const)("formatPercent(%s, %j) = %s", (input, opts, out) => expect(formatPercent(input, opts)).toBe(out));

  it.each([
    ["2026-03", "Mar 2026"],
    ["2024-12", "Dec 2024"],
    ["2025-01", "Jan 2025"],
    ["bogus", "bogus"],
  ])("formatPeriod(%s) = %s", (input, out) => expect(formatPeriod(input)).toBe(out));

  it("formatInteger groups thousands", () => expect(formatInteger(103868)).toBe("103,868"));
});
