import { afterEach, describe, expect, it, vi } from "vitest";
import starter from "@/data/starter/fixtures.json";
import overrides from "@/data/overrides/fixtures.local.json";
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
    // Not draining the body would leave this stream running into later tests, whose fake timers it would then pollute.
    await res.body?.cancel();
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
    await vi.advanceTimersByTimeAsync(0); // let the generator observe the cancellation before counting
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

describe("overridden fixtures keep the starter's kind, confidence and protocol", () => {
  it.each(overrides.overrides.map((o) => o.id))("%s", async (id) => {
    const original = starter.fixtures.find((f) => f.id === id);
    const keyword = original?.keywords?.[0];
    if (!original || !keyword) throw new Error(`no starter fixture or keyword for ${id}`);
    const { events } = await ask(keyword);
    expect(events.at(-1)).toMatchObject({ type: "done", kind: original.kind, confidence: original.answer.confidence });
    const streamed = events.filter((e) => e.type === "token").map((e) => e.value).join("");
    expect(streamed).toBe(overrides.overrides.find((o) => o.id === id)?.answer.text);
    expect(streamed).not.toBe(original.answer.text);
  });
});

describe("resumeFrom (mock-only resume)", () => {
  const stream = async (body: unknown) => {
    const res = await POST(new Request("http://test/api/chat", { method: "POST", body: JSON.stringify(body) }));
    const text = await res.text();
    return text.split("\n\n").filter(Boolean).map((f) => JSON.parse(f.replace(/^data: /, "")) as { type: string; value?: string });
  };

  it("skips the tokens the client already has and streams exactly the rest, then done", async () => {
    const full = await stream({ question: "next year" });
    const fullTokens = full.filter((e) => e.type === "token").map((e) => e.value ?? "");
    const rest = await stream({ question: "next year", resumeFrom: 5 });
    expect(rest.filter((e) => e.type === "token").map((e) => e.value)).toEqual(fullTokens.slice(5));
    expect(rest.at(-1)?.type).toBe("done");
    expect(fullTokens.slice(0, 5).join("") + rest.filter((e) => e.type === "token").map((e) => e.value).join("")).toBe(fullTokens.join(""));
  });

  it("resuming past the end just finishes with done; a negative or fractional offset is a 400", async () => {
    expect((await stream({ question: "summary", resumeFrom: 9999 })).map((e) => e.type)).toEqual(["done"]);
    for (const resumeFrom of [-1, 1.5, "3"]) {
      const res = await POST(new Request("http://test/api/chat", { method: "POST", body: JSON.stringify({ question: "summary", resumeFrom }) }));
      expect(res.status).toBe(400);
    }
  });
});

describe("view context", () => {
  it("answers 'what am I looking at?' from the context the dashboard sent, with the matching citation", async () => {
    const res = await POST(new Request("http://test/api/chat", { method: "POST", body: JSON.stringify({ question: "what am I looking at?", context: { marketId: "de", regionId: "eu", period: "2026-03" } }) }));
    const events = (await res.text()).split("\n\n").filter(Boolean).map((f) => JSON.parse(f.replace(/^data: /, "")) as { type: string; value?: string; citations?: unknown });
    expect(events.filter((e) => e.type === "token").map((e) => e.value).join("")).toContain("You are looking at Germany, Mar 2026");
    expect(events.at(-1)).toMatchObject({ type: "done", kind: "normal", citations: [{ marketId: "de", period: "2026-03" }] });
  });

  it("a malformed context is a 400, and a context nobody asked about changes nothing", async () => {
    const bad = await POST(new Request("http://test/api/chat", { method: "POST", body: JSON.stringify({ question: "x", context: { period: "soon" } }) }));
    expect(bad.status).toBe(400);
    const res = await POST(new Request("http://test/api/chat", { method: "POST", body: JSON.stringify({ question: "Germany next year", context: { marketId: "jp", period: "2026-05" } }) }));
    const text = (await res.text()).split("\n\n").filter(Boolean).map((f) => JSON.parse(f.replace(/^data: /, "")) as { type: string; value?: string }).filter((e) => e.type === "token").map((e) => e.value).join("");
    expect(text).toContain("I can't answer that");
  });
});
