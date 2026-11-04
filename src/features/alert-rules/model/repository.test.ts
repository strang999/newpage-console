// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertRule } from "@/domains/market";
import { alertRepository } from "./repository";

const KEY = "market-console.alert-rules.v1";
const rule = (id: string, over: Partial<AlertRule> = {}): AlertRule => ({
  id,
  createdAt: "2026-11-04T00:00:00.000Z",
  name: `Rule ${id}`,
  scope: "all",
  marketIds: [],
  metric: "growth",
  threshold: 0,
  enabled: true,
  ...over,
});

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("alertRepository", () => {
  it("starts empty", () => expect(alertRepository.load()).toEqual([]));

  it("commit applies a confirmed operation and persists it; load returns it validated", () => {
    alertRepository.commit({ op: "create", rule: rule("a") });
    alertRepository.commit({ op: "create", rule: rule("b") });
    alertRepository.commit({ op: "toggle", rule: rule("a", { enabled: false }) });
    alertRepository.commit({ op: "delete", rule: rule("b") });
    expect(alertRepository.load()).toEqual([rule("a", { enabled: false })]);
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "[]")).toHaveLength(1);
  });

  it.each([
    ["not JSON", "{oops"],
    ["wrong shape", JSON.stringify({ rules: [] })],
    ["an invalid rule inside", JSON.stringify([{ id: "x", name: "", scope: "all" }])],
  ])("ignores a corrupt stored value (%s) instead of crashing", (_n, stored) => {
    window.localStorage.setItem(KEY, stored);
    expect(alertRepository.load()).toEqual([]);
  });

  it("commit throws when storage is unavailable or full, so the caller can roll back", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(() => alertRepository.commit({ op: "create", rule: rule("a") })).toThrow();
    expect(alertRepository.load()).toEqual([]);
  });

  it("load survives blocked storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(alertRepository.load()).toEqual([]);
  });
});
