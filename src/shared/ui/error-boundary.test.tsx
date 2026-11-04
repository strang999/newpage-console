// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTelemetrySink, type TelemetryEvent } from "../observability";
import { ErrorBoundary, SurfaceFallback } from "./error-boundary";

let restore: () => void;
const events: TelemetryEvent[] = [];
beforeEach(() => {
  events.length = 0;
  restore = setTelemetrySink((e) => events.push(e));
  vi.spyOn(console, "error").mockImplementation(() => undefined); // React logs caught render errors
});
afterEach(() => {
  restore();
  cleanup();
  vi.restoreAllMocks();
});

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error("SENTINEL secret question text");
  return <p>chart drawn</p>;
}

describe("ErrorBoundary", () => {
  it("renders children when nothing fails", () => {
    render(
      <ErrorBoundary surface="map" fallback={() => <p>fallback</p>}>
        <Bomb explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("chart drawn")).toBeInTheDocument();
    expect(events).toEqual([]);
  });

  it("contains a render failure to its surface: the fallback shows and the siblings stay alive", () => {
    render(
      <div>
        <p>sibling</p>
        <ErrorBoundary surface="map" fallback={() => <p>map fallback</p>}>
          <Bomb explode />
        </ErrorBoundary>
        <p>other sibling</p>
      </div>,
    );
    expect(screen.getByText("map fallback")).toBeInTheDocument();
    expect(screen.getByText("sibling")).toBeInTheDocument();
    expect(screen.getByText("other sibling")).toBeInTheDocument();
  });

  it("reports the surface and a fixed code only: never the message, stack or any text of the failure", () => {
    render(
      <ErrorBoundary surface="map" fallback={() => <p>fallback</p>}>
        <Bomb explode />
      </ErrorBoundary>,
    );
    expect(events).toEqual([{ event: "render_error", surface: "map", errorCode: "render_error" }]);
    expect(JSON.stringify(events)).not.toContain("SENTINEL");
  });

  it("Try again clears the error and renders the surface again", async () => {
    let explode = true;
    const Flaky = () => <Bomb explode={explode} />;
    render(
      <ErrorBoundary surface="radar" fallback={(retry) => <SurfaceFallback title="Could not draw." detail="The table has every value." retry={retry} />}>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not draw.");
    explode = false; // the cause went away
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("chart drawn")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("if it fails again after a retry, the fallback returns", async () => {
    render(
      <ErrorBoundary surface="radar" fallback={(retry) => <SurfaceFallback title="Could not draw." detail="d" retry={retry} />}>
        <Bomb explode />
      </ErrorBoundary>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(events).toHaveLength(2);
  });
});
