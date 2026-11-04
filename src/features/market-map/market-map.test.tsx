// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import raw from "@/data/starter/data.json";
import { datasetSchema, type MapMetric } from "@/domains/market";
import { MarketMap } from "./index";

afterEach(cleanup);
const dataset = datasetSchema.parse(raw);

function setup(over: { metric?: MapMetric; selectedMarket?: string | null } = {}) {
  const onSelectMarket = vi.fn();
  const onMetricChange = vi.fn();
  render(
    <MarketMap dataset={dataset} period="2026-05" metric={over.metric ?? "revenue"} selectedMarket={over.selectedMarket ?? null} onMetricChange={onMetricChange} onSelectMarket={onSelectMarket} />,
  );
  return { onSelectMarket, onMetricChange };
}

const countryButtons = () => screen.findAllByRole("button", { name: /Press Enter to open/ });

describe("MarketMap", () => {
  it("renders the 13 market countries as focusable buttons with their value in the accessible name", async () => {
    setup();
    const buttons = await countryButtons();
    expect(buttons).toHaveLength(13);
    for (const b of buttons) expect(b).toHaveAttribute("tabindex", "0");
    expect(buttons.map((b) => b.getAttribute("aria-label")?.split(":")[0])).toEqual(dataset.markets.map((m) => m.name));
    expect(screen.getByRole("button", { name: /Germany: Revenue \$1\.68M/ })).toBeInTheDocument();
  });

  it("Enter and Space on a country drill into that market", async () => {
    const { onSelectMarket } = setup();
    const germany = await screen.findByRole("button", { name: /^Germany:/ });
    germany.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSelectMarket).toHaveBeenLastCalledWith("de");
    await userEvent.keyboard(" ");
    expect(onSelectMarket).toHaveBeenCalledTimes(2);
    await userEvent.click(await screen.findByRole("button", { name: /^Japan:/ }));
    expect(onSelectMarket).toHaveBeenLastCalledWith("jp");
  });

  it("marks the selected market (aria-pressed and in its name)", async () => {
    setup({ selectedMarket: "de" });
    const germany = await screen.findByRole("button", { name: /^Germany:.*selected/ });
    expect(germany).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByRole("button", { name: /^Japan:/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("focusing a country shows its value in the readout; leaving clears it", async () => {
    setup({ metric: "attainment" });
    const china = await screen.findByRole("button", { name: /^China:/ });
    china.focus();
    await waitFor(() => expect(screen.getByTestId("map-readout")).toHaveTextContent("China: Forecast attainment 106.6%"));
    china.blur();
    await waitFor(() => expect(screen.getByTestId("map-readout")).toHaveTextContent(/Hover or focus/));
  });

  it("the legend lists numeric stops and a hatched no-data entry, and names the metric", async () => {
    setup({ metric: "growth" });
    await countryButtons();
    const legend = screen.getByText("Growth vs prior year", { selector: "p.text-xs.font-semibold" }).parentElement;
    if (!legend) throw new Error("legend not found");
    for (const label of ["Below −5%", "−5% to 0%", "0% to 5%", "5% to 10%", "10% and above", "No data"]) expect(within(legend).getByText(label)).toBeInTheDocument();
  });

  it("changing the colour metric reports it (radio group, keyboard reachable)", async () => {
    const { onMetricChange } = setup();
    const group = screen.getByRole("group", { name: /Colour the map by/ });
    expect(within(group).getAllByRole("radio")).toHaveLength(4);
    expect(within(group).getByRole("radio", { name: "Revenue" })).toBeChecked();
    await userEvent.click(within(group).getByRole("radio", { name: "Status" }));
    expect(onMetricChange).toHaveBeenCalledWith("status");
  });

  it("status view labels the supplied snapshot", async () => {
    setup({ metric: "status" });
    await countryButtons();
    expect(screen.getByText(/supplied snapshot, May 2026/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Germany: Status Off track/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Italy: Status At risk/ })).toBeInTheDocument();
  });

  it("the table alternative has the same 13 values plus status with text, and drills too", async () => {
    const { onSelectMarket } = setup({ metric: "growth", selectedMarket: "de" });
    await userEvent.click(screen.getByRole("button", { name: "Table" }));
    const table = screen.getByRole("table", { name: /Growth vs prior year by market for May 2026/ });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(13);
    const germany = within(table).getByRole("row", { name: /Germany/ });
    expect(germany).toHaveTextContent("−9.7%");
    expect(germany).toHaveTextContent("Off track");
    expect(germany).toHaveAttribute("aria-current", "true");
    expect(within(table).getAllByText("On track")).toHaveLength(7);
    await userEvent.click(within(table).getByRole("button", { name: "Canada" }));
    expect(onSelectMarket).toHaveBeenCalledWith("ca");
  });
});
