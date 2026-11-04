import { describe, expect, it } from "vitest";
import type { AlertRule } from "@/domains/market";
import { applyOperation, FAILURE_TRIGGER, operationSchema, type ListedRule } from "./operations";

const rule = (id: string, over: Partial<AlertRule> = {}): AlertRule => ({
  id,
  createdAt: "2026-11-04T00:00:00.000Z",
  name: `Rule ${id}`,
  scope: "all",
  marketIds: [],
  metric: "attainment",
  threshold: 95,
  enabled: true,
  ...over,
});

describe("applyOperation (pure)", () => {
  const base = [rule("a"), rule("b")];

  it("create appends and never duplicates an id", () => {
    expect(applyOperation(base, { op: "create", rule: rule("c") }).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(applyOperation(base, { op: "create", rule: rule("a", { name: "Again" }) }).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("toggle replaces only the matching rule", () => {
    const next = applyOperation(base, { op: "toggle", rule: rule("b", { enabled: false }) });
    expect(next.map((r) => [r.id, r.enabled])).toEqual([
      ["a", true],
      ["b", false],
    ]);
  });

  it("delete removes only the matching rule; unknown ids change nothing", () => {
    expect(applyOperation(base, { op: "delete", rule: rule("a") }).map((r) => r.id)).toEqual(["b"]);
    expect(applyOperation(base, { op: "delete", rule: rule("zz") })).toHaveLength(2);
  });

  it("does not mutate its input, and can mark rules as pending for the optimistic view", () => {
    const frozen = Object.freeze([...base]);
    const next = applyOperation<ListedRule>(frozen, { op: "create", rule: rule("c") }, (r) => ({ ...r, pending: true }));
    expect(next.at(-1)?.pending).toBe(true);
    expect(next[0]?.pending).toBeUndefined();
    expect(frozen).toHaveLength(2);
  });
});

describe("operation contract", () => {
  it("accepts the three operations and rejects unknown ones and incomplete rules", () => {
    for (const op of ["create", "toggle", "delete"] as const) expect(operationSchema.safeParse({ op, rule: rule("a") }).success).toBe(true);
    expect(operationSchema.safeParse({ op: "explode", rule: rule("a") }).success).toBe(false);
    expect(operationSchema.safeParse({ op: "create", rule: { name: "x" } }).success).toBe(false);
  });

  it("the QA failure trigger is any name containing 'fail', case-insensitive", () => {
    for (const name of ["fail", "FAIL rule", "this will Fail", "failsafe"]) expect(FAILURE_TRIGGER.test(name)).toBe(true);
    for (const name of ["Europe watch", "Spain", "Fall in growth"]) expect(FAILURE_TRIGGER.test(name)).toBe(false);
  });
});
