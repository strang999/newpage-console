import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttemptResult } from "./consume";
import { DEFAULT_POLICY, runGeneration, type RetryPolicy } from "./generate";

const enc = new TextEncoder();
const frame = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
const done = { type: "done", kind: "normal", citations: [], confidence: "high" };
const SSE = { "content-type": "text/event-stream" };

const policy: RetryPolicy = { maxRetries: 2, baseDelayMs: 500, firstEventMs: 15_000, idleMs: 15_000, totalMs: 90_000, jitter: () => 0 };

type Script = (signal: AbortSignal) => Promise<Response>;
const full = (text: string): Script => () => Promise.resolve(new Response(enc.encode(frame({ type: "token", value: text }) + frame(done)), { status: 200, headers: SSE }));
const status = (code: number, headers: Record<string, string> = {}): Script => () => Promise.resolve(new Response("x", { status: code, headers }));
/** A stream that stays open and errors when the request is aborted, like a real fetch body. */
const hanging =
  (firstChunk?: string): Script =>
  (signal) => {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        if (firstChunk) c.enqueue(enc.encode(firstChunk));
        signal.addEventListener("abort", () => c.error(new DOMException("aborted", "AbortError")));
      },
    });
    return Promise.resolve(new Response(body, { status: 200, headers: SSE }));
  };

function harness(scripts: Script[], overrides: Partial<RetryPolicy> = {}) {
  const calls: number[] = [];
  const tokens: string[] = [];
  const retries: [number, number][] = [];
  const user = new AbortController();
  const fetchImpl = ((_url: string, init?: RequestInit) => {
    calls.push(Date.now());
    const script = scripts[calls.length - 1];
    if (!script) throw new Error("unexpected extra fetch");
    return script(init?.signal as AbortSignal);
  }) as typeof fetch;
  const promise: Promise<AttemptResult> = runGeneration({
    question: "q",
    signal: user.signal,
    onToken: (t) => tokens.push(t),
    onRetrying: (n, d) => retries.push([n, d]),
    fetchImpl,
    policy: { ...policy, ...overrides },
  });
  return { promise, calls, tokens, retries, user };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("automatic retry before the first token", () => {
  it("no first event within 15 s -> retry -> success, with no duplicate text", async () => {
    const h = harness([hanging(), full("fresh ")]);
    await vi.advanceTimersByTimeAsync(15_000); // first-event timeout
    await vi.advanceTimersByTimeAsync(500); // backoff
    const result = await h.promise;
    expect(result).toMatchObject({ kind: "done", receivedTokens: true });
    expect(h.tokens).toEqual(["fresh "]);
    expect(h.calls).toHaveLength(2);
    expect(h.retries).toEqual([[1, 500]]);
  });

  it("503 twice then success: backoff is 500 ms then 1 s", async () => {
    const h = harness([status(503), status(503), full("ok ")]);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await h.promise).toMatchObject({ kind: "done" });
    expect(h.retries).toEqual([
      [1, 500],
      [2, 1000],
    ]);
    expect(h.calls).toHaveLength(3);
  });

  it("gives up after two retries and returns the classified failure", async () => {
    const h = harness([status(503), status(503), status(503)]);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await h.promise).toMatchObject({ kind: "failed", failure: { code: "http", status: 503 } });
    expect(h.calls).toHaveLength(3);
  });

  it("adds jitter to the backoff", async () => {
    const h = harness([status(503), full("x ")], { jitter: (max) => max });
    await vi.advanceTimersByTimeAsync(750);
    await h.promise;
    expect(h.retries).toEqual([[1, 750]]);
  });

  it("honours Retry-After when it fits the budget", async () => {
    const h = harness([status(429, { "retry-after": "2" }), full("ok ")]);
    await vi.advanceTimersByTimeAsync(1999);
    expect(h.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await h.promise).toMatchObject({ kind: "done" });
    expect(h.retries).toEqual([[1, 2000]]);
  });

  it("Retry-After beyond the remaining budget stops retrying and offers a later manual retry", async () => {
    const h = harness([status(429, { "retry-after": "120" })]);
    const result = await h.promise;
    expect(result).toMatchObject({ kind: "failed", failure: { status: 429, retryAfterMs: 120_000 } });
    expect(result.kind === "failed" && result.failure.message).toContain("Try again in about 120 s");
    expect(h.calls).toHaveLength(1);
    expect(h.retries).toEqual([]);
  });

  it.each([
    ["400", status(400)],
    ["401", status(401)],
    ["500", status(500)],
    ["wrong content type", () => Promise.resolve(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }))],
    ["invalid event", () => Promise.resolve(new Response(enc.encode(frame({ type: "wat" })), { status: 200, headers: SSE }))],
    ["supplied error event", () => Promise.resolve(new Response(enc.encode(frame({ type: "error", message: "boom" })), { status: 200, headers: SSE }))],
  ] as [string, Script][])("%s is never retried automatically", async (_name, script) => {
    const h = harness([script]);
    expect((await h.promise).kind).toBe("failed");
    expect(h.calls).toHaveLength(1);
  });
});

describe("after the first token there is no automatic replay", () => {
  it("an idle gap of 15 s after tokens ends as incomplete (timed out) with the partial text and a single request", async () => {
    const h = harness([hanging(frame({ type: "token", value: "partial " }))]);
    await vi.advanceTimersByTimeAsync(15_000);
    const result = await h.promise;
    expect(result).toEqual({ kind: "incomplete", receivedTokens: true, timedOut: true });
    expect(h.tokens).toEqual(["partial "]);
    expect(h.calls).toHaveLength(1);
  });

  it("each event resets the idle timer", async () => {
    let push!: (s: string) => void;
    const script: Script = (signal) => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          push = (s) => c.enqueue(enc.encode(s));
          signal.addEventListener("abort", () => c.error(new DOMException("aborted", "AbortError")));
        },
      });
      return Promise.resolve(new Response(body, { status: 200, headers: SSE }));
    };
    const h = harness([script]);
    await vi.advanceTimersByTimeAsync(10);
    for (let i = 0; i < 4; i++) {
      push(frame({ type: "token", value: `t${i} ` }));
      await vi.advanceTimersByTimeAsync(10_000); // 40 s in total, never 15 s without an event
    }
    push(frame(done));
    expect(await h.promise).toMatchObject({ kind: "done" });
    expect(h.tokens).toEqual(["t0 ", "t1 ", "t2 ", "t3 "]);
  });
});

describe("Stop and the overall deadline", () => {
  it("Stop during backoff cancels the wait and sends no further request", async () => {
    const h = harness([status(503), full("never ")]);
    await vi.advanceTimersByTimeAsync(100); // inside the 500 ms backoff
    h.user.abort();
    expect(await h.promise).toEqual({ kind: "aborted", receivedTokens: false });
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.calls).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("Stop while streaming returns aborted and clears every timer", async () => {
    const h = harness([hanging(frame({ type: "token", value: "x " }))]);
    await vi.advanceTimersByTimeAsync(100);
    h.user.abort();
    expect(await h.promise).toEqual({ kind: "aborted", receivedTokens: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("the overall deadline ends a generation that keeps timing out; no request starts after it", async () => {
    const h = harness([hanging(), hanging(), hanging()], { totalMs: 20_000 });
    await vi.advanceTimersByTimeAsync(15_000); // attempt 1 times out
    await vi.advanceTimersByTimeAsync(500); // backoff, attempt 2 starts
    await vi.advanceTimersByTimeAsync(4_500); // deadline at 20 s cuts attempt 2
    const result = await h.promise;
    expect(result).toMatchObject({ kind: "failed", failure: { code: "timeout", retryable: false } });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.calls).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a user abort that arrives before the first request never fetches", async () => {
    const user = new AbortController();
    user.abort();
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await runGeneration({ question: "q", signal: user.signal, onToken: () => undefined, fetchImpl, policy });
    expect(result.kind).toBe("aborted");
  });
});

describe("DEFAULT_POLICY carries the documented numbers", () => {
  it("2 retries, 500 ms base, 15 s first event, 15 s idle, 90 s total", () => {
    expect(DEFAULT_POLICY).toMatchObject({ maxRetries: 2, baseDelayMs: 500, firstEventMs: 15_000, idleMs: 15_000, totalMs: 90_000 });
    const j = DEFAULT_POLICY.jitter(100);
    expect(j).toBeGreaterThanOrEqual(0);
    expect(j).toBeLessThan(100);
  });

  it("a generation without a policy override times out at 15 s, retries after the backoff, then succeeds", async () => {
    const calls: number[] = [];
    const scripts = [hanging(), full("ok ")];
    const promise = runGeneration({
      question: "q",
      signal: new AbortController().signal,
      onToken: () => undefined,
      fetchImpl: ((_u: string, init?: RequestInit) => {
        calls.push(Date.now());
        const script = scripts[calls.length - 1];
        if (!script) throw new Error("extra fetch");
        return script(init?.signal as AbortSignal);
      }) as typeof fetch,
    });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1 + 750); // timeout, then base 500 ms plus at most 250 ms jitter
    expect(await promise).toMatchObject({ kind: "done" });
    expect(calls).toHaveLength(2);
    expect((calls[1] ?? 0) - (calls[0] ?? 0)).toBeGreaterThanOrEqual(15_500);
  });
});

describe("retry and deadline edge cases", () => {
  it("Retry-After: 0 retries immediately, without backoff", async () => {
    const h = harness([status(503, { "retry-after": "0" }), full("ok ")]);
    await vi.advanceTimersByTimeAsync(0);
    expect(await h.promise).toMatchObject({ kind: "done" });
    expect(h.retries).toEqual([[1, 0]]);
  });

  it("a backoff longer than the remaining budget stops instead of retrying", async () => {
    const h = harness([status(503)], { totalMs: 400 });
    expect(await h.promise).toMatchObject({ kind: "failed", failure: { status: 503 } });
    expect(h.calls).toHaveLength(1);
    expect(h.retries).toEqual([]);
  });

  it("the deadline hitting after tokens ends as incomplete (timed out), keeping the partial text", async () => {
    const h = harness([hanging(frame({ type: "token", value: "partial " }))], { totalMs: 5_000, idleMs: 60_000, firstEventMs: 60_000 });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await h.promise).toEqual({ kind: "incomplete", receivedTokens: true, timedOut: true });
    expect(h.tokens).toEqual(["partial "]);
  });

  it("an empty 200 event stream with no tokens is incomplete and is not retried", async () => {
    const empty: Script = () => Promise.resolve(new Response(new ReadableStream({ start: (c) => c.close() }), { status: 200, headers: SSE }));
    const h = harness([empty]);
    expect(await h.promise).toEqual({ kind: "incomplete", receivedTokens: false });
    expect(h.calls).toHaveLength(1);
  });
});
