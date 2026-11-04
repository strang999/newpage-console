// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import raw from "@/data/starter/data.json";
import { datasetSchema } from "@/domains/market";
import { PortfolioOverview } from "./index";

afterEach(cleanup);

const dataset = datasetSchema.parse(raw);

describe("PortfolioOverview", () => {
  it("shows verified portfolio totals from the facts", () => {
    render(<PortfolioOverview dataset={dataset} />);
    const kpis = screen.getByRole("region", { name: "Portfolio health" });
    expect(within(kpis).getByText("$22.85M")).toBeInTheDocument();
    expect(within(kpis).getByText("+7.3%")).toBeInTheDocument();
    expect(within(kpis).getByText("100.4%")).toBeInTheDocument();
    expect(within(kpis).getByText("6")).toBeInTheDocument();
    expect(within(kpis).getByText(/4 at risk \+ 2 off track · 7 on track/)).toBeInTheDocument();
  });

  it("lists all 13 markets with text status and labels the snapshot columns", () => {
    render(<PortfolioOverview dataset={dataset} />);
    const table = screen.getByRole("table");
    const bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(13);
    expect(within(table).getAllByText("On track")).toHaveLength(7);
    expect(within(table).getAllByText("At risk")).toHaveLength(4);
    expect(within(table).getAllByText("Off track")).toHaveLength(2);
    expect(screen.getByText(/Supplied snapshot, May 2026/)).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Share*" })).toBeInTheDocument();
  });

  it("renders N/A when the prior-year denominator is zero", () => {
    const zeroPrior = structuredClone(dataset);
    for (const f of zeroPrior.series) if (f.marketId === "us" && f.period === zeroPrior.meta.latestPeriod) f.priorYear = 0;
    render(<PortfolioOverview dataset={zeroPrior} />);
    const row = screen.getByRole("row", { name: /United States/ });
    expect(within(row).getByText("N/A")).toBeInTheDocument();
  });

  it("has a keyboard-reachable scroll container for the table and no h1 (the page title belongs to the explorer)", () => {
    render(<PortfolioOverview dataset={dataset} />);
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(screen.getByRole("region", { name: /All markets/ })).toHaveAttribute("tabindex", "0");
  });

  it("derived figures follow the selected period while status stays the latest snapshot", () => {
    render(<PortfolioOverview dataset={dataset} period="2026-03" />);
    expect(screen.getByText(/derived from monthly facts, Mar 2026/)).toBeInTheDocument();
    expect(screen.getByText(/supplied status snapshot, May 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Supplied snapshot, May 2026/)).toBeInTheDocument();
  });

  it("each row has a drill action that opens that market and its products", async () => {
    const picked: string[] = [];
    render(<PortfolioOverview dataset={dataset} onSelectMarket={(id) => picked.push(id)} />);
    await userEvent.click(screen.getByRole("button", { name: "Open Germany and its products" }));
    expect(picked).toEqual(["de"]);
    expect(screen.getAllByRole("button", { name: /^Open .* and its products$/ })).toHaveLength(13);
  });

  it("the executive variant shows the health strip only: no dense table", () => {
    render(<PortfolioOverview dataset={dataset} variant="executive" />);
    expect(screen.getByRole("region", { name: "Portfolio health" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("the analyst table shows every metric: revenue, forecast, gap, growth, attainment, units, share and status", () => {
    render(<PortfolioOverview dataset={dataset} />);
    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent?.trim());
    expect(headers).toEqual(["Market", "Region", "Revenue", "Forecast", "Gap", "YoY growth", "Attainment", "Units", "Share*", "Status*", "Drill"]);
    const germany = within(table).getByRole("row", { name: /Germany/ });
    expect(germany).toHaveTextContent("$1,676,586");
    expect(germany).toHaveTextContent("$1,817,644"); // forecast
    expect(germany).toHaveTextContent("−$141,058"); // gap
    expect(germany).toHaveTextContent("7,618"); // units
  });

  const firstColumn = (table: HTMLElement) => within(table).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("rowheader")[0]?.textContent);

  it("sorting: headers are buttons, the active column has aria-sort, and the order really changes", async () => {
    render(<PortfolioOverview dataset={dataset} />);
    const table = screen.getByRole("table");
    expect(firstColumn(table)[0]).toBe("United States"); // dataset order
    expect(within(table).getAllByRole("columnheader").filter((h) => ["ascending", "descending"].includes(h.getAttribute("aria-sort") ?? ""))).toHaveLength(0);

    await userEvent.click(within(table).getByRole("button", { name: "Revenue" }));
    expect(firstColumn(table).slice(0, 3)).toEqual(["China", "United States", "Japan"]); // numeric columns start descending
    expect(within(table).getByRole("columnheader", { name: "Revenue" })).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByText("Sorted by Revenue, descending.")).toBeInTheDocument();

    await userEvent.click(within(table).getByRole("button", { name: "Revenue" }));
    expect(within(table).getByRole("columnheader", { name: "Revenue" })).toHaveAttribute("aria-sort", "ascending");
    expect(firstColumn(table)[0]).toBe("Spain");

    await userEvent.click(within(table).getByRole("button", { name: "Market" }));
    expect(firstColumn(table).slice(0, 3)).toEqual(["Australia", "Brazil", "Canada"]); // text starts ascending
    expect(within(table).getByRole("columnheader", { name: "Revenue" })).toHaveAttribute("aria-sort", "none");
  });

  it("sorting works from the keyboard", async () => {
    render(<PortfolioOverview dataset={dataset} />);
    const table = screen.getByRole("table");
    within(table).getByRole("button", { name: "YoY growth" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(firstColumn(table)[0]).toBe("China");
    await userEvent.keyboard(" ");
    expect(firstColumn(table)[0]).toBe("Germany"); // ascending: the lowest growth first
  });

  it("status sorts by severity (off track first) and N/A values sort last", async () => {
    const zeroPrior = structuredClone(dataset);
    for (const f of zeroPrior.series) if (f.marketId === "us" && f.period === zeroPrior.meta.latestPeriod) f.priorYear = 0;
    render(<PortfolioOverview dataset={zeroPrior} />);
    const table = screen.getByRole("table");
    await userEvent.click(within(table).getByRole("button", { name: "Status*" }));
    expect(firstColumn(table).slice(0, 2).sort()).toEqual(["Germany", "Spain"]);
    await userEvent.click(within(table).getByRole("button", { name: "YoY growth" }));
    expect(firstColumn(table).at(-1)).toBe("United States"); // N/A last (descending)
    await userEvent.click(within(table).getByRole("button", { name: "YoY growth" }));
    expect(firstColumn(table).at(-1)).toBe("United States"); // and last when ascending too
  });
});
