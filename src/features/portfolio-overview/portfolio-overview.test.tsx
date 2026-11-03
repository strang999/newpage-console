// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
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

  it("has a single h1 and a keyboard-reachable scroll container for the table", () => {
    render(<PortfolioOverview dataset={dataset} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Markets" })).toHaveAttribute("tabindex", "0");
  });
});
