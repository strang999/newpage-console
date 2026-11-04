// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import raw from "@/data/starter/data.json";
import { datasetSchema, metricsFromFacts } from "@/domains/market";
import { FactTable } from "./index";
import { buildFactRows, sortFactRows, type FactRow } from "./model/rows";
import { computeWindow } from "./model/window";

const dataset = datasetSchema.parse(raw);

afterEach(cleanup);

describe("computeWindow", () => {
  const base = { viewportHeight: 440, rowHeight: 36, total: 1560, overscan: 8 };

  it("at the top: the rows in view plus overscan below, a spacer for the rest", () => {
    const w = computeWindow({ ...base, scrollTop: 0 });
    expect(w).toEqual({ start: 0, end: Math.ceil(440 / 36) + 8, before: 0, after: (1560 - (Math.ceil(440 / 36) + 8)) * 36 });
  });

  it("in the middle: overscan on both sides, and the spacers plus the rows add up to the full list height", () => {
    const w = computeWindow({ ...base, scrollTop: 36 * 500 });
    expect(w.start).toBe(492);
    expect(w.end).toBe(Math.ceil((36 * 500 + 440) / 36) + 8);
    expect(w.before + (w.end - w.start) * 36 + w.after).toBe(1560 * 36);
  });

  it("at the very bottom, and past it (momentum scrolling overshoots), the last row is still rendered", () => {
    for (const scrollTop of [1560 * 36 - 440, 1560 * 36, 1e9]) {
      const w = computeWindow({ ...base, scrollTop });
      expect(w.end).toBe(1560);
      expect(w.after).toBe(0);
      expect(w.start).toBeLessThan(1560);
    }
  });

  it("nothing, one row and fewer rows than the viewport are all fine", () => {
    expect(computeWindow({ ...base, total: 0, scrollTop: 0 })).toEqual({ start: 0, end: 0, before: 0, after: 0 });
    expect(computeWindow({ ...base, total: 1, scrollTop: 500 })).toEqual({ start: 0, end: 1, before: 0, after: 0 });
    expect(computeWindow({ ...base, total: 5, scrollTop: 0 })).toMatchObject({ start: 0, end: 5, after: 0 });
    expect(computeWindow({ ...base, scrollTop: -50 }).start).toBe(0);
  });
});

describe("fact rows", () => {
  it("covers every fact at portfolio level and narrows by region, market and product", () => {
    expect(buildFactRows(dataset, {})).toHaveLength(13 * 5 * 24);
    expect(buildFactRows(dataset, { regionId: "eu" })).toHaveLength(5 * 5 * 24);
    expect(buildFactRows(dataset, { marketId: "de", regionId: "eu" })).toHaveLength(5 * 24);
    expect(buildFactRows(dataset, { marketId: "de", regionId: "eu", productId: "veltrix" })).toHaveLength(24);
    expect(buildFactRows(dataset, { marketId: "de", regionId: "apac" })).toHaveLength(0); // a market outside the region
  });

  it("derives gap, attainment and growth with the shared domain function", () => {
    const fact = dataset.series.find((f) => f.marketId === "jp" && f.productId === "veltrix" && f.period === "2026-05");
    if (!fact) throw new Error("fixture missing");
    const row = buildFactRows(dataset, { marketId: "jp" }).find((r) => r.key === "jp|veltrix|2026-05");
    const m = metricsFromFacts([fact]);
    expect(row).toMatchObject({ actual: fact.actual, gap: m.gap, growthPct: m.growthPct, attainmentPct: m.attainmentPct, market: "Japan", product: "Veltrix", region: "APAC" });
  });
});

describe("sortFactRows", () => {
  const row = (key: string, v: Partial<FactRow>): FactRow => ({ key, period: "2026-01", marketId: "x", market: "X", region: "R", product: "P", actual: 1, forecast: 1, gap: 0, growthPct: 0, attainmentPct: 100, units: 1, ...v });

  it("sorts numbers and text both ways, and keeps dataset order for ties", () => {
    const rows = [row("a", { actual: 5 }), row("b", { actual: 9 }), row("c", { actual: 5 }), row("d", { actual: 1 })];
    expect(sortFactRows(rows, "actual", "ascending").map((r) => r.key)).toEqual(["d", "a", "c", "b"]);
    expect(sortFactRows(rows, "actual", "descending").map((r) => r.key)).toEqual(["b", "a", "c", "d"]);
    expect(sortFactRows([row("a", { market: "Spain" }), row("b", { market: "Brazil" })], "market", "ascending").map((r) => r.key)).toEqual(["b", "a"]);
  });

  it("a missing value sorts last in either direction", () => {
    const rows = [row("a", { growthPct: null }), row("b", { growthPct: 3 }), row("c", { growthPct: -2 })];
    expect(sortFactRows(rows, "growth", "ascending").map((r) => r.key)).toEqual(["c", "b", "a"]);
    expect(sortFactRows(rows, "growth", "descending").map((r) => r.key)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate its input", () => {
    const rows = [row("a", { actual: 2 }), row("b", { actual: 1 })];
    sortFactRows(rows, "actual", "ascending");
    expect(rows.map((r) => r.key)).toEqual(["a", "b"]);
  });
});

describe("FactTable", () => {
  const bodyRows = () => within(screen.getByRole("table")).getAllByRole("row").filter((r) => r.getAttribute("aria-rowindex") !== "1" && r.getAttribute("aria-hidden") !== "true");

  it("draws only the rows in view out of 1,560, but announces the full size to assistive technology", () => {
    render(<FactTable dataset={dataset} scope={{}} />);
    const table = screen.getByRole("table");
    expect(table).toHaveAttribute("aria-rowcount", "1561");
    expect(bodyRows().length).toBeGreaterThan(10);
    expect(bodyRows().length).toBeLessThan(40);
    expect(bodyRows()[0]).toHaveAttribute("aria-rowindex", "2");
    expect(screen.getByTestId("fact-table-range")).toHaveTextContent("Rows 1–13 of 1,560");
  });

  it("scrolling brings later rows in and drops the earlier ones, with the right row indexes and range", async () => {
    render(<FactTable dataset={dataset} scope={{}} />);
    const region = screen.getByRole("region", { name: /scrollable/ });
    await act(async () => {
      fireEvent.scroll(region, { target: { scrollTop: 36 * 800 } });
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    const first = bodyRows()[0];
    expect(Number(first?.getAttribute("aria-rowindex"))).toBeGreaterThan(780);
    expect(screen.getByTestId("fact-table-range")).toHaveTextContent("Rows 801–813 of 1,560");
    expect(bodyRows().length).toBeLessThan(40);
  });

  it("sorting from the heading changes the first row, marks aria-sort, and returns to the top", async () => {
    render(<FactTable dataset={dataset} scope={{}} />);
    const region = screen.getByRole("region", { name: /scrollable/ });
    await act(async () => {
      fireEvent.scroll(region, { target: { scrollTop: 36 * 300 } });
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    await userEvent.click(screen.getByRole("button", { name: "Actual" }));
    expect(screen.getByRole("columnheader", { name: "Actual" })).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByTestId("fact-table-range")).toHaveTextContent("Rows 1–13 of 1,560");
    const top = Math.max(...dataset.series.map((f) => f.actual));
    expect(bodyRows()[0]).toHaveTextContent(new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(top));
    await userEvent.click(screen.getByRole("button", { name: "Actual" }));
    expect(screen.getByRole("columnheader", { name: "Actual" })).toHaveAttribute("aria-sort", "ascending");
  });

  it("follows the scope: a market shows its own 120 rows", () => {
    render(<FactTable dataset={dataset} scope={{ marketId: "de", regionId: "eu" }} />);
    expect(screen.getByRole("heading", { name: /Monthly facts · Germany/ })).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveAttribute("aria-rowcount", "121");
    expect(bodyRows().every((r) => within(r).getAllByRole("cell")[1]?.textContent === "Germany")).toBe(true);
  });
});
