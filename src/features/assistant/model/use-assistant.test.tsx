// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTelemetrySink, type TelemetryEvent } from "@/shared/observability";
import { useAssistant } from "./use-assistant";

afterEach(() => vi.unstubAllGlobals());

const enc = new TextEncoder();
const frame = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;

function stubStream() {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let signal: AbortSignal | undefined;
  const fetchMock = vi.fn((_u: string, init?: RequestInit) => {
    signal = init?.signal ?? undefined;
    const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
    signal?.addEventListener("abort", () => {
      try {
        controller?.error(new DOMException("aborted", "AbortError"));
      } catch {
        /* closed */
      }
    });
    return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    push: (s: string) => controller?.enqueue(enc.encode(s)),
    close: () => controller?.close(),
    signal: () => signal,
  };
}

describe("useAssistant", () => {
  it("flushes buffered tokens before applying the terminal action (no tokens lost to rAF batching)", async () => {
    const s = stubStream();
    const { result } = renderHook(() => useAssistant());
    act(() => result.current.ask("q"));
    await waitFor(() => expect(s.signal()).toBeDefined());
    s.push(
      frame({ type: "token", value: "one " }) +
        frame({ type: "token", value: "two " }) +
        frame({ type: "token", value: "three " }) +
        frame({ type: "done", kind: "normal", citations: [], confidence: "high" }),
    );
    s.close();
    await waitFor(() => expect(result.current.state.messages[0]?.status).toBe("complete"));
    expect(result.current.state.messages[0]?.text).toBe("one two three ");
  });

  it("unmounting aborts the request, cancels the pending frame and dispatches nothing afterwards", async () => {
    const s = stubStream();
    const cancel = vi.spyOn(globalThis, "cancelAnimationFrame");
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result, unmount } = renderHook(() => useAssistant());
    act(() => result.current.ask("q"));
    await waitFor(() => expect(s.signal()).toBeDefined());
    s.push(frame({ type: "token", value: "pending " }));
    await new Promise((r) => setTimeout(r, 0));
    unmount();
    expect(s.signal()?.aborted).toBe(true);
    await new Promise((r) => setTimeout(r, 30));
    expect(errors).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
    errors.mockRestore();
    cancel.mockRestore();
  });

  it("a second ask while one is running is ignored", async () => {
    const s = stubStream();
    const { result } = renderHook(() => useAssistant());
    act(() => result.current.ask("first"));
    await waitFor(() => expect(s.signal()).toBeDefined());
    act(() => result.current.ask("second"));
    expect(result.current.state.messages).toHaveLength(1);
    expect(s.fetchMock).toHaveBeenCalledTimes(1);
  });

  describe("telemetry", () => {
    const ALLOWED = new Set(["event", "attemptId", "durationMs", "ttftMs", "retryCount", "terminalState", "errorCode", "surface", "metric", "value", "rating", "navigationType"]);
    let events: TelemetryEvent[];
    let restore: () => void;
    beforeEach(() => {
      events = [];
      restore = setTelemetrySink((e) => events.push(e));
    });
    afterEach(() => restore());

    it("a completed answer reports timings and the terminal state, never the question, answer, citations or the server's error text", async () => {
      const s = stubStream();
      const { result } = renderHook(() => useAssistant());
      act(() => result.current.ask("SENTINEL_QUESTION what is Germany's revenue?"));
      await waitFor(() => expect(s.signal()).toBeDefined());
      s.push(
        frame({ type: "token", value: "SENTINEL_ANSWER " }) +
          frame({ type: "done", kind: "normal", citations: [{ marketId: "de", label: "SENTINEL_CITATION" }], confidence: "high" }),
      );
      s.close();
      await waitFor(() => expect(result.current.state.messages[0]?.status).toBe("complete"));
      await waitFor(() => expect(events).toHaveLength(1));
      expect(events[0]).toMatchObject({ event: "assistant_stream", terminalState: "complete", retryCount: 0 });
      expect(typeof events[0]?.durationMs).toBe("number");
      expect(typeof events[0]?.ttftMs).toBe("number");
      for (const key of Object.keys(events[0] ?? {})) expect(ALLOWED.has(key), key).toBe(true);
      expect(JSON.stringify(events)).not.toMatch(/SENTINEL|Germany|revenue/);
    });

    it("a server error event reports only the classified code", async () => {
      const s = stubStream();
      const { result } = renderHook(() => useAssistant());
      act(() => result.current.ask("SENTINEL_QUESTION"));
      await waitFor(() => expect(s.signal()).toBeDefined());
      s.push(frame({ type: "error", message: "SENTINEL_SERVER_MESSAGE with user text" }));
      s.close();
      await waitFor(() => expect(events).toHaveLength(1));
      expect(events[0]).toMatchObject({ terminalState: "error", errorCode: "server_error" });
      expect(JSON.stringify(events)).not.toContain("SENTINEL");
    });

    it("Stop reports 'stopped' with the time to first token if one arrived", async () => {
      const s = stubStream();
      const { result } = renderHook(() => useAssistant());
      act(() => result.current.ask("q"));
      await waitFor(() => expect(s.signal()).toBeDefined());
      s.push(frame({ type: "token", value: "partial " }));
      await new Promise((r) => setTimeout(r, 20));
      act(() => result.current.stop());
      await waitFor(() => expect(events).toHaveLength(1));
      expect(events[0]).toMatchObject({ terminalState: "stopped" });
      expect(typeof events[0]?.ttftMs).toBe("number");
    });
  });
});
