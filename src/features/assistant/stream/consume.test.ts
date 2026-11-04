import { describe, expect, it } from "vitest";
import { parseRetryAfter, runAttempt, type AttemptResult } from "./consume";

const enc = new TextEncoder();
const frame = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
const doneEvent = { type: "done", kind: "normal", citations: [{ marketId: "de", period: "2026-03" }], confidence: "high" };

/** A response whose body the test feeds chunk by chunk, so frame boundaries are fully controlled. */
function controlled(init: ResponseInit = { headers: { "content-type": "text/event-stream" } }) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
  return {
    response: new Response(body, { status: 200, ...init }),
    push: (chunk: string | Uint8Array) => controller.enqueue(typeof chunk === "string" ? enc.encode(chunk) : chunk),
    close: () => controller.close(),
    error: () => controller.error(new Error("connection reset")),
  };
}

async function collect(response: Response | Error, signal: AbortSignal = new AbortController().signal) {
  const tokens: string[] = [];
  const fetchImpl = (() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response))) as typeof fetch;
  const result = await runAttempt({ question: "q", signal, onToken: (t) => tokens.push(t), fetchImpl });
  return { tokens, result };
}

describe("runAttempt framing", () => {
  it("reassembles a frame split in the middle of the JSON", async () => {
    const c = controlled();
    const run = collect(c.response);
    const text = frame({ type: "token", value: "Hello " });
    c.push(text.slice(0, 15));
    c.push(text.slice(15));
    c.push(frame(doneEvent));
    c.close();
    const { tokens, result } = await run;
    expect(tokens).toEqual(["Hello "]);
    expect(result).toMatchObject({ kind: "done", meta: { kind: "normal", confidence: "high" } });
  });

  it("decodes a multibyte UTF-8 character split across network chunks", async () => {
    const c = controlled();
    const run = collect(c.response);
    const bytes = enc.encode(frame({ type: "token", value: "Müller – ¥ " }));
    const cut = bytes.indexOf(0xc3) + 1; // between the two bytes of "ü"
    c.push(bytes.slice(0, cut));
    c.push(bytes.slice(cut));
    c.push(frame(doneEvent));
    c.close();
    expect((await run).tokens).toEqual(["Müller – ¥ "]);
  });

  it("accepts CRLF line endings", async () => {
    const c = controlled();
    const run = collect(c.response);
    c.push(frame({ type: "token", value: "a " }).replaceAll("\n", "\r\n"));
    c.push(frame(doneEvent).replaceAll("\n", "\r\n"));
    c.close();
    const { tokens, result } = await run;
    expect(tokens).toEqual(["a "]);
    expect(result.kind).toBe("done");
  });

  it("handles several events in one network chunk, in order", async () => {
    const c = controlled();
    const run = collect(c.response);
    c.push(frame({ type: "token", value: "one " }) + frame({ type: "token", value: "two " }) + frame(doneEvent));
    c.close();
    const { tokens, result } = await run;
    expect(tokens).toEqual(["one ", "two "]);
    expect(result.kind).toBe("done");
  });

  it("returns citations and confidence only with the done event", async () => {
    const c = controlled();
    const run = collect(c.response);
    c.push(frame({ type: "token", value: "x " }));
    c.push(frame(doneEvent));
    c.close();
    const { result } = await run;
    expect(result).toMatchObject({ kind: "done", meta: { citations: [{ marketId: "de", period: "2026-03" }], confidence: "high" } });
  });
});

describe("runAttempt failure classification", () => {
  it("EOF without done after tokens is incomplete, with the tokens delivered", async () => {
    const c = controlled();
    const run = collect(c.response);
    c.push(frame({ type: "token", value: "partial " }));
    c.close();
    const { tokens, result } = await run;
    expect(tokens).toEqual(["partial "]);
    expect(result).toEqual({ kind: "incomplete", receivedTokens: true });
  });

  it("a connection error after tokens is incomplete (never an automatic retry)", async () => {
    const c = controlled();
    const run = collect(c.response);
    c.push(frame({ type: "token", value: "partial " }));
    await new Promise((r) => setTimeout(r, 0));
    c.error();
    expect((await run).result).toMatchObject({ kind: "incomplete", receivedTokens: true });
  });

  it("a connection error before any token is a retryable network failure", async () => {
    const c = controlled();
    const run = collect(c.response);
    c.error();
    const { result } = await run;
    expect(result).toMatchObject({ kind: "failed", receivedTokens: false, failure: { code: "network", retryable: true } });
  });

  it("an invalid event schema is a non-retryable protocol failure", async () => {
    const c = controlled();
    const run = collect(c.response);
    c.push(frame({ type: "token", value: 42 }));
    c.close();
    expect((await run).result).toMatchObject({ kind: "failed", failure: { code: "protocol", retryable: false } });
  });

  it("malformed JSON is a protocol failure", async () => {
    const c = controlled();
    const run = collect(c.response);
    c.push("data: {not json\n\n");
    c.close();
    expect((await run).result).toMatchObject({ kind: "failed", failure: { code: "protocol" } });
  });

  it("a citation with a malformed period still completes (it becomes an unresolved reference later)", async () => {
    const c = controlled();
    const run = collect(c.response);
    c.push(frame({ ...doneEvent, citations: [{ marketId: "de", period: "2026-13" }] }));
    c.close();
    expect((await run).result).toMatchObject({ kind: "done", meta: { citations: [{ marketId: "de", period: "2026-13" }] } });
  });

  it("a confidence outside high/medium/low is rejected", async () => {
    const c = controlled();
    const run = collect(c.response);
    c.push(frame({ ...doneEvent, confidence: "certain" }));
    c.close();
    expect((await run).result).toMatchObject({ kind: "failed", failure: { code: "protocol" } });
  });

  it("the supplied error event becomes a classified, non-retryable server error with its message", async () => {
    const c = controlled();
    const run = collect(c.response);
    c.push(frame({ type: "error", message: "boom" }));
    c.close();
    expect((await run).result).toMatchObject({ kind: "failed", failure: { code: "server_error", message: "boom", retryable: false } });
  });

  it.each([
    [429, true],
    [503, true],
    [400, false],
    [401, false],
    [500, false],
  ])("HTTP %s is retryable=%s", async (status, retryable) => {
    const { result } = await collect(new Response("nope", { status, headers: { "retry-after": "2" } }));
    expect(result).toMatchObject({ kind: "failed", failure: { code: "http", status, retryable, retryAfterMs: 2000 } });
  });

  it("a non event-stream content type is rejected without retry", async () => {
    const { result } = await collect(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    expect(result).toMatchObject({ kind: "failed", failure: { code: "content_type", retryable: false } });
  });

  it("a response without a body is an unsupported-stream failure", async () => {
    const res = new Response(null, { status: 200, headers: { "content-type": "text/event-stream" } });
    expect((await collect(res)).result).toMatchObject({ kind: "failed", failure: { code: "no_body" } });
  });

  it("a rejected fetch is a retryable network failure", async () => {
    expect((await collect(new TypeError("Failed to fetch"))).result).toMatchObject({ kind: "failed", failure: { code: "network", retryable: true } });
  });
});

describe("runAttempt abort", () => {
  it("aborting mid-stream returns aborted and keeps the tokens already delivered", async () => {
    const c = controlled();
    const ac = new AbortController();
    const run = collect(c.response, ac.signal);
    c.push(frame({ type: "token", value: "so far " }));
    await new Promise((r) => setTimeout(r, 0));
    ac.abort();
    c.error();
    const { tokens, result } = await run;
    expect(tokens).toEqual(["so far "]);
    expect(result).toEqual({ kind: "aborted", receivedTokens: true });
  });

  it("aborting before the response arrives returns aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const err = new DOMException("aborted", "AbortError");
    const { result } = await collect(err, ac.signal);
    expect(result).toEqual<AttemptResult>({ kind: "aborted", receivedTokens: false });
  });
});

describe("parseRetryAfter", () => {
  it("parses seconds and HTTP dates, ignores junk", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    expect(parseRetryAfter("0")).toBe(0);
    expect(parseRetryAfter("Wed, 21 Oct 2026 07:28:05 GMT", Date.parse("Wed, 21 Oct 2026 07:28:00 GMT"))).toBe(5000);
    expect(parseRetryAfter("soon")).toBeUndefined();
    expect(parseRetryAfter("   ")).toBeUndefined();
    expect(parseRetryAfter("")).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});
