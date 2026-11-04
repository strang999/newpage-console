// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import raw from "@/data/starter/data.json";
import { datasetSchema } from "@/domains/market";
import { setTelemetrySink, type TelemetryEvent } from "@/shared/observability";

// The lazily loaded canvas throws on render (as a failed chunk load or a drawing bug would).
const state = { explode: true };
vi.mock("./ui/map-canvas", () => ({
  default: () => {
    if (state.explode) throw new Error("SENTINEL map exploded");
    return <div data-testid="map-drawn">map</div>;
  },
}));

import { MarketMap } from "./index";

const dataset = datasetSchema.parse(raw);
const events: TelemetryEvent[] = [];
let restore: () => void;
beforeEach(() => {
  state.explode = true;
  events.length = 0;
  restore = setTelemetrySink((e) => events.push(e));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  restore();
  cleanup();
  vi.restoreAllMocks();
});

describe("MarketMap when the map itself fails", () => {
  it("renders an explanatory alert and the same data as a table, with the rest of the card alive", async () => {
    const onSelectMarket = vi.fn();
    const onMetricChange = vi.fn();
    render(<MarketMap dataset={dataset} period="2026-05" metric="attainment" selectedMarket={null} onMetricChange={onMetricChange} onSelectMarket={onSelectMarket} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("The map could not be drawn.");
    const table = screen.getByRole("table", { name: /Forecast attainment by market for May 2026/ });
    expect(within(table).getAllByRole("row")).toHaveLength(14);
    expect(within(table).getByRole("row", { name: /Germany/ })).toHaveTextContent("92.2%");

    // still interactive: select a market from the table, change the metric, read the legend
    await userEvent.click(within(table).getByRole("button", { name: "Japan" }));
    expect(onSelectMarket).toHaveBeenCalledWith("jp");
    await userEvent.click(screen.getByRole("radio", { name: "Growth" }));
    expect(onMetricChange).toHaveBeenCalledWith("growth");
    expect(screen.getByText("Under 95%")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Markets on the map" })).toBeInTheDocument();
  });

  it("reports only the surface and a code, never the error text", async () => {
    render(<MarketMap dataset={dataset} period="2026-05" metric="revenue" selectedMarket={null} onMetricChange={() => undefined} onSelectMarket={() => undefined} />);
    await screen.findByRole("alert");
    expect(events).toEqual([{ event: "render_error", surface: "map", errorCode: "render_error" }]);
    expect(JSON.stringify(events)).not.toContain("SENTINEL");
  });

  it("Try again draws the map once the cause is gone, and the card around it never went away", async () => {
    render(<MarketMap dataset={dataset} period="2026-05" metric="revenue" selectedMarket={null} onMetricChange={() => undefined} onSelectMarket={() => undefined} />);
    await screen.findByRole("alert");
    state.explode = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("map-drawn")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Markets on the map" })).toBeInTheDocument();
  });
});
