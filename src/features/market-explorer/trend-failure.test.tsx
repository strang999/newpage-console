// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import raw from "@/data/starter/data.json";
import { datasetSchema } from "@/domains/market";
import { setTelemetrySink, type TelemetryEvent } from "@/shared/observability";

vi.mock("./ui/trend-chart", () => ({
  default: () => {
    throw new Error("SENTINEL chart exploded");
  },
}));

import { MarketExplorer } from "./index";

const dataset = datasetSchema.parse(raw);
const events: TelemetryEvent[] = [];
let restore: () => void;
beforeEach(() => {
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
});
