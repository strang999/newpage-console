import { describe, expect, it, vi } from "vitest";
import { ALLOWED_KEYS, buildEvent, sanitizeIncoming, setTelemetrySink, track, type TelemetryEvent } from "./index";

describe("buildEvent: the allowlist", () => {
  it("keeps only allowlisted keys with code-shaped values and finite numbers", () => {
    const e = buildEvent("assistant_stream", {
      attemptId: "a12",
      durationMs: 1234.56789,
      ttftMs: 80,
      retryCount: 1,
      terminalState: "complete",
      errorCode: undefined,
      question: "What is Germany's revenue?",
      answer: "Germany fell",
      citations: [{ label: "x" }],
      draft: "Europe watch",
      url: "https://example.com/?q=secret",
    });
    expect(e).toEqual({ event: "assistant_stream", attemptId: "a12", durationMs: 1234.568, ttftMs: 80, retryCount: 1, terminalState: "complete" });
    for (const key of Object.keys(e ?? {})) expect(ALLOWED_KEYS as readonly string[]).toContain(key);
  });

  it("free text cannot be smuggled through an allowed key: strings must look like codes", () => {
    const e = buildEvent("render_error", { surface: "map", errorCode: "Cannot read properties of undefined (reading 'name')", terminalState: "SENTINEL TEXT WITH SPACES" });
    expect(e).toEqual({ event: "render_error", surface: "map" });
    expect(buildEvent("render_error", { errorCode: "x".repeat(41) })).toEqual({ event: "render_error" });
    expect(buildEvent("render_error", { errorCode: "http_503" })).toEqual({ event: "render_error", errorCode: "http_503" });
  });

  it("drops non-finite numbers and non-primitive values", () => {
    expect(buildEvent("web_vital", { metric: "LCP", value: Number.NaN, rating: { good: true }, navigationType: ["x"] })).toEqual({ event: "web_vital", metric: "LCP" });
    expect(buildEvent("web_vital", { value: Number.POSITIVE_INFINITY })).toEqual({ event: "web_vital" });
  });

  it("an unknown event name produces nothing", () => {
    expect(buildEvent("page_view", {})).toBeNull();
    expect(buildEvent(42, {})).toBeNull();
    expect(buildEvent(undefined)).toBeNull();
  });
});

describe("sanitizeIncoming (the sink route applies the same filter)", () => {
  it("re-filters whatever arrives", () => {
    expect(sanitizeIncoming({ event: "web_vital", metric: "CLS", value: 0.02, rating: "good", extra: "SENTINEL", html: "<script>" })).toEqual({ event: "web_vital", metric: "CLS", value: 0.02, rating: "good" });
    expect(sanitizeIncoming("string")).toBeNull();
    expect(sanitizeIncoming(null)).toBeNull();
    expect(sanitizeIncoming([])).toBeNull();
    expect(sanitizeIncoming({ event: "nope" })).toBeNull();
  });
});

describe("track and the sink", () => {
  it("delivers the sanitised event to the current sink and restores the previous one", () => {
    const seen: TelemetryEvent[] = [];
    const restore = setTelemetrySink((e) => seen.push(e));
    track("assistant_stream", { attemptId: "a1", terminalState: "stopped", question: "SENTINEL" });
    restore();
    expect(seen).toEqual([{ event: "assistant_stream", attemptId: "a1", terminalState: "stopped" }]);
    const after = vi.fn();
    const restore2 = setTelemetrySink(after);
    restore2();
    track("assistant_stream", {});
    expect(after).not.toHaveBeenCalled();
  });

  it("never throws, even when the sink does", () => {
    const restore = setTelemetrySink(() => {
      throw new Error("sink down");
    });
    expect(() => track("render_error", { surface: "map" })).not.toThrow();
    restore();
  });

  it("an unknown event reaches no sink", () => {
    const sink = vi.fn();
    const restore = setTelemetrySink(sink);
    track("something_else", { a: 1 });
    restore();
    expect(sink).not.toHaveBeenCalled();
  });
});
