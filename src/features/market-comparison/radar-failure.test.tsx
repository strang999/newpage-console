// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import raw from "@/data/starter/data.json";
import { datasetSchema } from "@/domains/market";
import { setTelemetrySink, type TelemetryEvent } from "@/shared/observability";

const state = { explode: true };
vi.mock("./ui/radar", () => ({
  default: () => {
    if (state.explode) throw new Error("SENTINEL radar exploded");
    return <div data-testid="radar-drawn">radar</div>;
  },
}));

import { MarketComparison } from "./index";

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

describe("MarketComparison when the radar fails", () => {
  it("keeps the table and the text summary, reports only a code, and Try again redraws the radar once it can", async () => {
    render(<MarketComparison dataset={dataset} period="2026-05" compareType="market" compare={["de", "it", "gb"]} onChange={() => undefined} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("The radar could not be drawn.");
    const table = screen.getByRole("table", { name: /Raw revenue/ });
    expect(within(table).getByRole("row", { name: /Germany/ })).toHaveTextContent("$1,676,586");
    expect(screen.getByText(/Highest revenue: United Kingdom/)).toBeInTheDocument();
    expect(events).toEqual([{ event: "render_error", surface: "radar", errorCode: "render_error" }]);
    expect(JSON.stringify(events)).not.toContain("SENTINEL");

    state.explode = false; // the cause went away
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("radar-drawn")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
