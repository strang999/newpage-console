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

  it("market names call onSelectMarket when provided", async () => {
    const picked: string[] = [];
    render(<PortfolioOverview dataset={dataset} onSelectMarket={(id) => picked.push(id)} />);
    await userEvent.click(screen.getByRole("button", { name: "Germany" }));
    expect(picked).toEqual(["de"]);
  });
});
