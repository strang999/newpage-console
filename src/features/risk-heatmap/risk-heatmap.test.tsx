// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import raw from "@/data/starter/data.json";
import { datasetSchema } from "@/domains/market";
import { RiskHeatmap, type HeatmapSelection } from "./index";

afterEach(cleanup);
const dataset = datasetSchema.parse(raw);

function setup(over: { regionId?: string | null; selectedMarket?: string | null; period?: string } = {}) {
  const onSelect = vi.fn<(s: HeatmapSelection) => void>();
  render(<RiskHeatmap dataset={dataset} regionId={over.regionId ?? null} selectedMarket={over.selectedMarket ?? null} period={over.period ?? "2026-05"} onSelect={onSelect} />);
  return { onSelect };
}
const cell = (market: string, month: string) => screen.getByRole("button", { name: new RegExp(`^${market}, ${month}:`) });
const stops = () => screen.getAllByRole("button").filter((b) => b.getAttribute("tabindex") === "0");

describe("RiskHeatmap", () => {
  it("portfolio: 13 markets x 24 months as a grid with row and column headers", () => {
    setup();
    const grid = screen.getByRole("grid");
    expect(within(grid).getAllByRole("row")).toHaveLength(14);
    expect(within(grid).getAllByRole("gridcell")).toHaveLength(13 * 24);
    expect(within(grid).getAllByRole("rowheader").map((h) => h.textContent)).toContain("Germany");
    expect(within(grid).getAllByRole("columnheader")).toHaveLength(25);
  });

  it("a region shows its sibling markets and does not collapse when one is selected", () => {
    setup({ regionId: "eu", selectedMarket: "de" });
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Germany", "United Kingdom", "France", "Italy", "Spain"]);
    expect(screen.getByRole("heading", { name: /Europe markets by month/ })).toBeInTheDocument();
  });

  it("each cell shows its number and has an accessible name with the month, attainment and points", () => {
    setup({ regionId: "eu" });
    const march = cell("Germany", "Mar 2026");
    expect(march).toHaveAccessibleName("Germany, Mar 2026: 92.2% of forecast, 7.8 points under forecast");
    expect(march).toHaveTextContent("−7.8");
    expect(cell("Germany", "May 2026")).toHaveTextContent("−7.8");
    expect(cell("Spain", "May 2026")).toHaveTextContent("+4.7");
  });

  it("roving tabindex: exactly one tab stop, defaulting to the selected period's column, or to the selected cell", () => {
    setup({ regionId: "eu", period: "2026-03" });
    expect(stops()).toHaveLength(1);
    expect(stops()[0]).toHaveAccessibleName(/^Germany, Mar 2026/);
    cleanup();
    setup({ regionId: "eu", selectedMarket: "it", period: "2026-03" });
    expect(stops()).toHaveLength(1);
    expect(stops()[0]).toHaveAccessibleName(/^Italy, Mar 2026/);
  });

  it("arrow keys move focus and the tab stop; edges clamp; Home/End/PageUp/PageDown and Ctrl+Home/End work", async () => {
    setup({ regionId: "eu", period: "2026-03" });
    stops()[0]?.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toHaveAccessibleName(/^Germany, Apr 2026/);
    expect(stops()[0]).toBe(document.activeElement);
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toHaveAccessibleName(/^United Kingdom, Apr 2026/);
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(document.activeElement).toHaveAccessibleName(/^Germany, Apr 2026/); // clamped at the first row
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toHaveAccessibleName(/^Germany, Jun 2024/);
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toHaveAccessibleName(/^Germany, Jun 2024/); // clamped at the first column
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toHaveAccessibleName(/^Germany, May 2026/);
    await userEvent.keyboard("{PageDown}");
    expect(document.activeElement).toHaveAccessibleName(/^Spain, May 2026/);
    await userEvent.keyboard("{PageUp}");
    expect(document.activeElement).toHaveAccessibleName(/^Germany, May 2026/);
    await userEvent.keyboard("{Control>}{End}{/Control}");
    expect(document.activeElement).toHaveAccessibleName(/^Spain, May 2026/);
    await userEvent.keyboard("{Control>}{Home}{/Control}");
    expect(document.activeElement).toHaveAccessibleName(/^Germany, Jun 2024/);
    expect(stops()).toHaveLength(1);
  });

  it("click, Enter and Space select that market and month", async () => {
    const { onSelect } = setup({ regionId: "eu" });
    await userEvent.click(cell("Germany", "Mar 2026"));
    expect(onSelect).toHaveBeenLastCalledWith({ market: "de", period: "2026-03" });
    cell("Italy", "Jan 2026").focus();
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenLastCalledWith({ market: "it", period: "2026-01" });
    await userEvent.keyboard(" ");
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it("a pointer press does not move focus (it would scroll the grid between press and release and lose the tap), but a click still selects", () => {
    const { onSelect } = setup({ regionId: "eu" });
    const target = cell("Germany", "Mar 2026");
    expect(fireEvent.mouseDown(target)).toBe(false); // default prevented -> no focus change
    fireEvent.click(target);
    expect(onSelect).toHaveBeenCalledWith({ market: "de", period: "2026-03" });
  });

  it("the selected cell is marked beyond colour: aria-selected, aria-pressed and a data hook for the outline", () => {
    setup({ regionId: "eu", selectedMarket: "de", period: "2026-03" });
    const selected = cell("Germany", "Mar 2026");
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(selected).toHaveAttribute("data-selected", "true");
    expect(selected.closest("td")).toHaveAttribute("aria-selected", "true");
    expect(cell("Germany", "Apr 2026").closest("td")).toHaveAttribute("aria-selected", "false");
    expect(screen.getAllByRole("gridcell").filter((c) => c.getAttribute("aria-selected") === "true")).toHaveLength(1);
  });

  it("the legend states the bins in points and the keyboard help is described by the grid", () => {
    setup();
    const legend = screen.getByText("Points versus forecast").parentElement;
    if (!legend) throw new Error("legend");
    for (const l of ["Under −6 pts", "−6 to under −2 pts", "−2 to under +2 pts (on plan)", "+2 to under +6 pts", "+6 pts and above"]) expect(within(legend).getByText(l)).toBeInTheDocument();
    const help = screen.getByRole("grid").getAttribute("aria-describedby");
    expect(document.getElementById(help ?? "")).toHaveTextContent(/Arrow keys move between cells/);
  });
});
