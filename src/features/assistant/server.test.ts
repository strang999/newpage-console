import { describe, expect, it } from "vitest";
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

  it("abstains for a beyond-horizon question", async () => {
    const { events } = await ask("what about 2027");
    expect(events.at(-1)).toMatchObject({ type: "done", kind: "abstain", confidence: "low" });
  });
});
