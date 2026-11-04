// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTelemetrySink, type TelemetryEvent } from "../observability";
import { createRetryableLazy, LazySurface } from "./lazy-surface";

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

const Widget = ({ label }: { label: string }) => <p>widget: {label}</p>;

describe("LazySurface", () => {
  it("shows a loading state, then the component with its props", async () => {
    const handle = createRetryableLazy(async () => Widget);
    render(
      <LazySurface surface="heatmap" title="The heatmap" handle={handle} loadingMinHeight="5rem">
        {(C) => <C label="ready" />}
      </LazySurface>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading the heatmap…");
    expect(await screen.findByText("widget: ready")).toBeInTheDocument();
  });

  it("a chunk that fails to load shows a contained fallback; Try again re-requests it and recovers", async () => {
    let calls = 0;
    const handle = createRetryableLazy(async () => {
      calls += 1;
      if (calls === 1) throw new Error("SENTINEL chunk failed");
      return Widget;
    });
    render(
      <div>
        <p>sibling</p>
        <LazySurface surface="alerts" title="Alert rules" handle={handle} loadingMinHeight="5rem">
          {(C) => <C label="loaded" />}
        </LazySurface>
      </div>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Alert rules is unavailable.");
    expect(screen.getByText("sibling")).toBeInTheDocument();
    expect(events).toEqual([{ event: "render_error", surface: "alerts", errorCode: "render_error" }]);
    expect(JSON.stringify(events)).not.toContain("SENTINEL");

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("widget: loaded")).toBeInTheDocument(); // the chunk was requested again, not served from a cached rejection
    expect(calls).toBe(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("if the retry fails too, the fallback comes back (and Try again can be pressed again)", async () => {
    let calls = 0;
    const handle = createRetryableLazy(async () => {
      calls += 1;
      if (calls < 3) throw new Error("down");
      return Widget;
    });
    render(
      <LazySurface surface="comparison" title="The comparison" handle={handle} loadingMinHeight="5rem">
        {(C) => <C label="up" />}
      </LazySurface>,
    );
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(calls).toBe(2));
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("widget: up")).toBeInTheDocument();
    expect(calls).toBe(3);
  });

  it("keyboard focus is not dropped on <body> after Try again: it returns to the container, or to the new alert if the retry failed", async () => {
    let calls = 0;
    const handle = createRetryableLazy(async () => {
      calls += 1;
      if (calls < 3) throw new Error("down");
      return Widget;
    });
    const { container } = render(
      <section>
        <LazySurface surface="alerts" title="Alert rules" handle={handle} loadingMinHeight="5rem">
          {(C) => <C label="up" />}
        </LazySurface>
      </section>,
    );
    await screen.findByRole("alert");
    screen.getByRole("button", { name: "Try again" }).focus();
    await userEvent.keyboard("{Enter}");
    const failedAgain = await screen.findByRole("alert");
    await waitFor(() => expect(failedAgain).toHaveFocus()); // retry failed: the new alert has focus

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("widget: up");
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
    expect(container.contains(document.activeElement)).toBe(true);
  });
});
