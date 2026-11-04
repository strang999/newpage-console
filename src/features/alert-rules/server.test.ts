import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./server";

afterEach(() => vi.useRealTimers());

const rule = (over: object = {}) => ({
  id: "r1",
  createdAt: "2026-11-04T00:00:00.000Z",
  name: "Europe watch",
  scope: "all",
  marketIds: [],
  metric: "attainment",
  threshold: 95,
  enabled: true,
  ...over,
});
const post = (body: unknown, raw = false) => POST(new Request("http://test/api/alerts", { method: "POST", body: raw ? String(body) : JSON.stringify(body) }));

async function settled(promise: Promise<Response>) {
  await vi.advanceTimersByTimeAsync(1000);
  return promise;
}

describe("mock /api/alerts", () => {
  it("validates, waits (simulated latency) and echoes the rule", async () => {
    vi.useFakeTimers();
    const p = post({ op: "create", rule: rule() });
    let done = false;
    void p.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(300);
    expect(done).toBe(false); // the optimistic window is real: the response is not instant
    const res = await settled(p);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, op: "create", rule: { id: "r1", name: "Europe watch" } });
  });

  it.each(["fail", "FAIL rule", "this will Fail"])("a rule named %j fails deterministically with a 500", async (name) => {
    vi.useFakeTimers();
    const res = await settled(post({ op: "create", rule: rule({ name }) }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/simulated failure/);
  });

  it("the failure trigger applies to toggle and delete too", async () => {
    vi.useFakeTimers();
    expect((await settled(post({ op: "toggle", rule: rule({ name: "fail me" }) }))).status).toBe(500);
    expect((await settled(post({ op: "delete", rule: rule({ name: "fail me" }) }))).status).toBe(500);
  });

  it.each([
    ["invalid JSON", "{nope", true],
    ["unknown operation", { op: "explode", rule: rule() }, false],
    ["a threshold out of bounds", { op: "create", rule: rule({ threshold: 999 }) }, false],
    ["a selected scope with no markets", { op: "create", rule: rule({ scope: "selected", marketIds: [] }) }, false],
    ["an unknown market id", { op: "create", rule: rule({ scope: "selected", marketIds: ["zz"] }) }, false],
  ])("%s -> 400 with a message and no stored state", async (_n, body, raw) => {
    const res = await post(body, raw);
    expect(res.status).toBe(400);
    expect(typeof (await res.json()).error).toBe("string");
  });

  it("stores nothing: the same valid request twice behaves identically (no process-global state)", async () => {
    vi.useFakeTimers();
    const first = await settled(post({ op: "create", rule: rule() }));
    const second = await settled(post({ op: "create", rule: rule() }));
    expect(await first.json()).toEqual(await second.json());
  });
});
