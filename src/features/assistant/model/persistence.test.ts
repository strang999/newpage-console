// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { loadConversation, maxIdNumber, saveConversation } from "./persistence";
import type { Message } from "./reducer";

const base: Message = { id: "m1", question: "q", attemptId: "a2", status: "complete", text: "answer", meta: { kind: "normal", citations: [{ marketId: "de" }], confidence: "high" }, failure: null, autoRetries: 0, prior: [] };

beforeEach(() => sessionStorage.clear());

describe("conversation persistence", () => {
  it("round-trips completed answers with their citations and confidence", () => {
    saveConversation([base]);
    expect(loadConversation()).toEqual([base]);
  });

  it("a request that was still running comes back as interrupted: partial text kept, no confidence, retryable", () => {
    saveConversation([{ ...base, id: "m3", attemptId: "a4", status: "streaming", text: "partial ", meta: null }]);
    const [restored] = loadConversation();
    expect(restored).toMatchObject({ status: "incomplete", text: "partial ", meta: null });
  });

  it("corrupt, foreign or schema-invalid storage is ignored, never thrown", () => {
    sessionStorage.setItem("assistant:conversation:v1", "{not json");
    expect(loadConversation()).toEqual([]);
    sessionStorage.setItem("assistant:conversation:v1", JSON.stringify({ v: 1, messages: [{ id: 1 }] }));
    expect(loadConversation()).toEqual([]);
    sessionStorage.setItem("assistant:conversation:v1", JSON.stringify({ v: 2, messages: [] }));
    expect(loadConversation()).toEqual([]);
  });

  it("keeps only the last 50 messages", () => {
    saveConversation(Array.from({ length: 60 }, (_, i) => ({ ...base, id: `m${i}` })));
    expect(loadConversation()).toHaveLength(50);
    expect(loadConversation()[0]?.id).toBe("m10");
  });

  it("new ids continue after the highest stored one", () => {
    expect(maxIdNumber([{ ...base, id: "m7", attemptId: "a8", prior: [{ attemptId: "a12", text: "x", status: "stopped" }] }])).toBe(12);
  });
});
