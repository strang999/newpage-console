import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const post = (body: string) => POST(new Request("http://test/api/telemetry", { method: "POST", body }));

describe("/api/telemetry (no-op sink)", () => {
  it("always answers 204, so a client never retries, for valid, malformed and oversized bodies", async () => {
    for (const body of [JSON.stringify({ event: "web_vital", metric: "LCP", value: 1200 }), "{not json", "x".repeat(5000), ""]) {
      const res = await post(body);
      expect(res.status).toBe(204);
      expect(await res.text()).toBe("");
    }
  });

  it("re-applies the allowlist: with logging on, only allowlisted fields are ever logged", async () => {
    vi.stubEnv("TELEMETRY_LOG", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await post(JSON.stringify({ event: "assistant_stream", terminalState: "complete", durationMs: 900, question: "SENTINEL_Q", answer: "SENTINEL_A", url: "http://x/?q=SENTINEL" }));
    expect(info).toHaveBeenCalledTimes(1);
    const logged = String(info.mock.calls[0]?.[1]);
    expect(JSON.parse(logged)).toEqual({ event: "assistant_stream", terminalState: "complete", durationMs: 900 });
    expect(logged).not.toContain("SENTINEL");
  });

  it("unknown event names, and oversized bodies, are dropped silently", async () => {
    vi.stubEnv("TELEMETRY_LOG", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await post(JSON.stringify({ event: "page_view", url: "/" }));
    await post(JSON.stringify({ event: "web_vital", padding: "x".repeat(5000) }));
    expect(info).not.toHaveBeenCalled();
  });

  it("logs nothing by default (nothing is stored or forwarded)", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await post(JSON.stringify({ event: "web_vital", metric: "CLS", value: 0.01 }));
    expect(info).not.toHaveBeenCalled();
  });
});
