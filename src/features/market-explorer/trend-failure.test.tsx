// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import raw from "@/data/starter/data.json";
import { datasetSchema } from "@/domains/market";
import { setTelemetrySink, type TelemetryEvent } from "@/shared/observability";

const state = { explode: true };
vi.mock("./ui/trend-chart", () => ({
  default: () => {
    if (state.explode) throw new Error("SENTINEL chart exploded");
    return <div data-testid="chart-drawn">chart</div>;
  },
}));

import { MarketExplorer } from "./index";

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

describe("MarketExplorer when the trend chart fails", () => {
  it("falls back to the monthly table with every value, keeps the text summary, and the controls still work", async () => {
    const onSelect = vi.fn();
    render(<MarketExplorer dataset={dataset} scope={{ regionId: "eu", marketId: "de" }} period="2026-03" onSelect={onSelect} onPeriodChange={() => undefined} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("The chart could not be drawn.");
    const table = screen.getByRole("table", { name: /Monthly actual, forecast and prior-year revenue for Germany/ });
    expect(within(table).getAllByRole("row")).toHaveLength(25);
    expect(within(table).getByRole("row", { name: /Mar 2026 \(selected\)/ })).toHaveTextContent("$1,211,930");
    expect(screen.getByText(/Germany, Mar 2026:/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Germany" })).toBeInTheDocument();
    expect(events).toEqual([{ event: "render_error", surface: "trend-chart", errorCode: "render_error" }]);
    expect(JSON.stringify(events)).not.toContain("SENTINEL");
  });

  it("Try again draws the chart once the cause is gone", async () => {
    render(<MarketExplorer dataset={dataset} scope={{}} period="2026-05" onSelect={() => undefined} onPeriodChange={() => undefined} />);
    await screen.findByRole("alert");
    state.explode = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("chart-drawn")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Portfolio overview" })).toBeInTheDocument();
  });
});
