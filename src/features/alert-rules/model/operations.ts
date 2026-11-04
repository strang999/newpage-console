import "@/shared/lib/zod-config";
import { z } from "zod";
import { alertRuleSchema, type AlertRule } from "@/domains/market";

/** The one contract between the client and the mock endpoint, and the pure reducer both optimistic UI and storage use. */
export const operationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create"), rule: alertRuleSchema }),
  z.object({ op: z.literal("toggle"), rule: alertRuleSchema }), // the rule as it should be after the toggle
  z.object({ op: z.literal("delete"), rule: alertRuleSchema }),
]);
export type Operation = z.infer<typeof operationSchema>;

/** A rule as listed in the UI: `pending` while its write has not been confirmed. */
export type ListedRule = AlertRule & { pending?: boolean };

/** Applies an operation to a list. Pure; used for the optimistic cache update and for the confirmed storage write. */
export function applyOperation<T extends AlertRule>(rules: readonly T[], operation: Operation, mark?: (rule: AlertRule) => T): T[] {
  const lift = mark ?? ((r: AlertRule) => r as T);
  switch (operation.op) {
    case "create":
      return [...rules.filter((r) => r.id !== operation.rule.id), lift(operation.rule)];
    case "toggle":
      return rules.map((r) => (r.id === operation.rule.id ? lift(operation.rule) : r));
    case "delete":
      return rules.filter((r) => r.id !== operation.rule.id);
  }
}

/** QA trigger, documented in the README and the UI: any rule whose name contains "fail" is rejected by the mock endpoint. */
export const FAILURE_TRIGGER = /fail/i;
export const MOCK_LATENCY_MS = 700;
