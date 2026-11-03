// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import raw from "@/data/starter/data.json";
import { datasetSchema } from "@/domains/market";
import { MarketExplorer } from "./index";

afterEach(cleanup);

const dataset = datasetSchema.parse(raw);

function setup(scope: { regionId?: string; marketId?: string; productId?: string }, period = "2026-05") {
  const onSelect = vi.fn();
  const onPeriodChange = vi.fn();
  render(<MarketExplorer dataset={dataset} scope={scope} period={period} onSelect={onSelect} onPeriodChange={onPeriodChange} />);
  return { onSelect, onPeriodChange };
}

describe("MarketExplorer", () => {
  it("portfolio level: h1, regions to drill into, breadcrumb with only the current item", async () => {
    const { onSelect } = setup({});
    expect(screen.getByRole("heading", { level: 1, name: "Portfolio overview" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByText("Portfolio")).toHaveAttribute("aria-current", "page");
    const children = screen.getByRole("region", { name: /Regions/ });
    expect(within(children).getAllByRole("button")).toHaveLength(4);
    await userEvent.click(within(children).getByRole("button", { name: "Europe" }));
    expect(onSelect).toHaveBeenCalledWith({ region: "eu" });
  });

  it("market level: breadcrumb path, products to drill into, product selection keeps the market", async () => {
    const { onSelect } = setup({ regionId: "eu", marketId: "de" });
    expect(screen.getByRole("heading", { level: 1, name: "Germany" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getAllByRole("listitem")).toHaveLength(3);
    expect(within(nav).getByText("Germany")).toHaveAttribute("aria-current", "page");
    await userEvent.click(within(nav).getByRole("button", { name: "Europe" }));
    expect(onSelect).toHaveBeenLastCalledWith({ region: "eu" });
    await userEvent.click(within(nav).getByRole("button", { name: "Portfolio" }));
    expect(onSelect).toHaveBeenLastCalledWith({ region: null });
    await userEvent.click(screen.getByRole("button", { name: "Veltrix" }));
    expect(onSelect).toHaveBeenLastCalledWith({ market: "de", product: "veltrix" });
  });

  it("product level has no children table", () => {
    setup({ regionId: "eu", marketId: "de", productId: "veltrix" });
    expect(screen.getByRole("heading", { level: 1, name: "Germany · Veltrix" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Products/ })).not.toBeInTheDocument();
  });

  it("period picker lists all 24 periods, newest first, and reports changes", async () => {
    const { onPeriodChange } = setup({}, "2026-03");
    const select = screen.getByRole("combobox", { name: "Period" });
    expect(within(select).getAllByRole("option")).toHaveLength(24);
    expect(within(select).getAllByRole("option")[0]).toHaveTextContent("May 2026");
    expect(select).toHaveValue("2026-03");
    await userEvent.selectOptions(select, "2025-01");
    expect(onPeriodChange).toHaveBeenCalledWith("2025-01");
  });

  it("text summary and table alternative show exact values and mark the selected month", async () => {
    setup({ regionId: "eu", marketId: "de" }, "2026-03");
    expect(screen.getByText(/Germany, Mar 2026:/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Table" }));
    const table = screen.getByRole("table", { name: /Monthly actual, forecast and prior-year revenue for Germany/ });
    expect(within(table).getAllByRole("row")).toHaveLength(25);
    const march = within(table).getByRole("rowheader", { name: "Mar 2026 (selected)" }).closest("tr");
    if (!march) throw new Error("selected row not found");
    const cells = within(march).getAllByRole("cell").map((c) => c.textContent);
    expect(cells).toEqual(["$1,211,930", "$1,314,025", "$1,757,641"]);
    expect(screen.getByText(/actual \$1,211,930 against a forecast of \$1,314,025 \(attainment 92\.2%\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Table" })).toHaveAttribute("aria-pressed", "true");
  });
});
