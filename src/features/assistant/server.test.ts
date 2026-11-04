import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./server";

type Ev = { type: string; value?: string; kind?: string; confidence?: string; message?: string };

async function ask(question: string): Promise<{ res: Response; events: Ev[] }> {
  const res = await POST(
    new Request("http://test/api/chat", { method: "POST", body: JSON.stringify({ question }) }),
  );
  const text = await res.text();
  const events = text
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => JSON.parse(frame.replace(/^data: /, "")) as Ev);
  return { res, events };
}

describe("supplied mock /api/chat (starter route, unchanged protocol)", () => {
  it("streams token events then a final done with categorical confidence", async () => {
    const { res, events } = await ask("germany");
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const last = events.at(-1);
    expect(events.slice(0, -1).every((e) => e.type === "token")).toBe(true);
    expect(events.length).toBeGreaterThan(10);
    expect(last).toMatchObject({ type: "done", kind: "normal", confidence: "high" });
  });

  it("emits a single error event for the error fixture", async () => {
    const { events } = await ask("force error");
    expect(events).toEqual([{ type: "error", message: expect.any(String) }]);
  });

  it("abstain and error triggers win over topic keywords (Germany next year abstains)", async () => {
    expect((await ask("Germany next year")).events.at(-1)).toMatchObject({ type: "done", kind: "abstain" });
    expect((await ask("force error in germany")).events).toEqual([{ type: "error", message: expect.any(String) }]);
  });

  it("abstains for a beyond-horizon question", async () => {
    const { events } = await ask("what about 2027");
    expect(events.at(-1)).toMatchObject({ type: "done", kind: "abstain", confidence: "low" });
  });
});

describe("route hardening", () => {
  const post = (body: BodyInit | null, signal?: AbortSignal) => POST(new Request("http://test/api/chat", { method: "POST", body, signal }));

  it.each([
    ["invalid JSON", "{nope"],
    ["missing question", JSON.stringify({})],
    ["non-string question", JSON.stringify({ question: 7 })],
    ["blank question", JSON.stringify({ question: "   " })],
    ["too long", JSON.stringify({ question: "x".repeat(501) })],
  ])("%s -> 400 with a message, not a stream", async (_n, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: expect.any(String) });
  });

  it("trims the question before matching", async () => {
    const res = await post(JSON.stringify({ question: "   germany   " }));
    expect(res.status).toBe(200);
  });
});

describe("route cancellation", () => {
  afterEach(() => vi.useRealTimers());

  it("a client abort stops enqueueing, closes the stream and clears the token timer", async () => {
    vi.useFakeTimers();
    const ac = new AbortController();
    const res = await POST(new Request("http://test/api/chat", { method: "POST", body: JSON.stringify({ question: "summary" }), signal: ac.signal }));
    const reader = res.body?.getReader();
    if (!reader) throw new Error("no body");
    await vi.advanceTimersByTimeAsync(80);
    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
    ac.abort();
    expect(vi.getTimerCount()).toBe(0);
    let drained = 0;
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
      drained += 1;
      if (drained > 5) throw new Error("stream kept producing after abort");
    }
  });

  it("cancelling the reader (Stop) clears the timer and nothing further is produced", async () => {
    vi.useFakeTimers();
    const res = await POST(new Request("http://test/api/chat", { method: "POST", body: JSON.stringify({ question: "summary" }) }));
    const reader = res.body?.getReader();
    if (!reader) throw new Error("no body");
    await vi.advanceTimersByTimeAsync(40);
    await reader.read();
    await reader.cancel();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("an already-aborted request produces no events", async () => {
    const ac = new AbortController();
    ac.abort();
    const res = await POST(new Request("http://test/api/chat", { method: "POST", body: JSON.stringify({ question: "germany" }), signal: ac.signal }));
    const text = await res.text();
    expect(text).toBe("");
  });
});
