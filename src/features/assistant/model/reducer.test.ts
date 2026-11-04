import { describe, expect, it } from "vitest";
import type { DoneMeta } from "./events";
import { initialState, reducer, type Action, type AssistantState } from "./reducer";

const meta: DoneMeta = { kind: "normal", citations: [], confidence: "high" };
const run = (actions: Action[], from: AssistantState = initialState) => actions.reduce(reducer, from);
const asked: Action = { type: "asked", id: "m1", question: "q", attemptId: "a1" };
const only = (s: AssistantState) => {
  const m = s.messages[0];
  if (!m) throw new Error("no message");
  return m;
};

describe("assistant reducer lifecycle", () => {
  it("connecting -> streaming -> complete; metadata exists only after done", () => {
    const s1 = run([asked]);
    expect(only(s1)).toMatchObject({ status: "connecting", text: "", meta: null });
    const s2 = run([{ type: "tokens", id: "m1", attemptId: "a1", text: "Hello " }], s1);
    expect(only(s2)).toMatchObject({ status: "streaming", text: "Hello ", meta: null });
    const s3 = run([{ type: "completed", id: "m1", attemptId: "a1", meta }], s2);
    expect(only(s3)).toMatchObject({ status: "complete", text: "Hello ", meta });
  });

  it("stop keeps the partial text and leaves metadata unavailable", () => {
    const s = run([asked, { type: "tokens", id: "m1", attemptId: "a1", text: "part " }, { type: "stopped", id: "m1", attemptId: "a1" }]);
    expect(only(s)).toMatchObject({ status: "stopped", text: "part ", meta: null });
  });

  it("EOF without done is incomplete, distinct from stopped and error", () => {
    const s = run([asked, { type: "tokens", id: "m1", attemptId: "a1", text: "part " }, { type: "interrupted", id: "m1", attemptId: "a1" }]);
    expect(only(s)).toMatchObject({ status: "incomplete", text: "part ", meta: null, failure: null });
  });

  it("a failure keeps the classified error", () => {
    const failure = { code: "http", status: 503, message: "m", retryable: true } as const;
    const s = run([asked, { type: "failed", id: "m1", attemptId: "a1", failure }]);
    expect(only(s)).toMatchObject({ status: "error", failure });
  });

  it("terminal states are final: late events change nothing", () => {
    const stopped = run([asked, { type: "tokens", id: "m1", attemptId: "a1", text: "x " }, { type: "stopped", id: "m1", attemptId: "a1" }]);
    const after = run(
      [
        { type: "tokens", id: "m1", attemptId: "a1", text: "late " },
        { type: "completed", id: "m1", attemptId: "a1", meta },
      ],
      stopped,
    );
    expect(only(after)).toMatchObject({ status: "stopped", text: "x ", meta: null });
  });
});

describe("automatic retry bookkeeping", () => {
  it("counts automatic retries while connecting and resets them on a manual retry", () => {
    const s = run([asked, { type: "retrying", id: "m1", attemptId: "a1", retry: 1 }, { type: "retrying", id: "m1", attemptId: "a1", retry: 2 }]);
    expect(only(s)).toMatchObject({ status: "connecting", autoRetries: 2 });
    const failed = run([{ type: "failed", id: "m1", attemptId: "a1", failure: { code: "http", message: "m", retryable: true } }, { type: "retried", id: "m1", attemptId: "a2" }], s);
    expect(only(failed).autoRetries).toBe(0);
  });

  it("ignores a late retrying notice once tokens arrived", () => {
    const s = run([asked, { type: "tokens", id: "m1", attemptId: "a1", text: "x " }, { type: "retrying", id: "m1", attemptId: "a1", retry: 1 }]);
    expect(only(s).autoRetries).toBe(0);
  });
});

describe("retry and stale events", () => {
  it("retry archives the partial answer separately and starts a clean attempt", () => {
    const s = run([
      asked,
      { type: "tokens", id: "m1", attemptId: "a1", text: "partial " },
      { type: "interrupted", id: "m1", attemptId: "a1" },
      { type: "retried", id: "m1", attemptId: "a2" },
      { type: "tokens", id: "m1", attemptId: "a2", text: "fresh " },
    ]);
    expect(only(s)).toMatchObject({
      attemptId: "a2",
      status: "streaming",
      text: "fresh ",
      prior: [{ attemptId: "a1", text: "partial ", status: "incomplete" }],
    });
  });

  it("events from the previous attempt are ignored after a retry (no duplicated text)", () => {
    const s = run([
      asked,
      { type: "tokens", id: "m1", attemptId: "a1", text: "old " },
      { type: "failed", id: "m1", attemptId: "a1", failure: { code: "network", message: "x", retryable: true } },
      { type: "retried", id: "m1", attemptId: "a2" },
      { type: "tokens", id: "m1", attemptId: "a1", text: "ghost " },
      { type: "completed", id: "m1", attemptId: "a1", meta },
      { type: "tokens", id: "m1", attemptId: "a2", text: "new " },
    ]);
    expect(only(s)).toMatchObject({ text: "new ", status: "streaming", meta: null });
  });

  it("retrying a message with no partial text archives nothing", () => {
    const s = run([
      asked,
      { type: "failed", id: "m1", attemptId: "a1", failure: { code: "network", message: "x", retryable: true } },
      { type: "retried", id: "m1", attemptId: "a2" },
    ]);
    expect(only(s).prior).toEqual([]);
    expect(only(s)).toMatchObject({ status: "connecting", failure: null });
  });

  it("other messages are untouched by events for one message", () => {
    const s = run([
      asked,
      { type: "completed", id: "m1", attemptId: "a1", meta },
      { type: "asked", id: "m2", question: "q2", attemptId: "b1" },
      { type: "tokens", id: "m2", attemptId: "b1", text: "two " },
    ]);
    expect(s.messages.map((m) => [m.id, m.status, m.text])).toEqual([
      ["m1", "complete", ""],
      ["m2", "streaming", "two "],
    ]);
  });
});
