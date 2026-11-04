// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
});
