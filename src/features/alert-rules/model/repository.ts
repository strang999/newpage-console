import { z } from "@/shared/lib/zod";
import { alertRuleSchema, type AlertRule } from "@/domains/market";
import { applyOperation, type Operation } from "./operations";

export class RuleMissingError extends Error {}

const KEY = "market-console.alert-rules.v1";
const listSchema = z.array(alertRuleSchema);

function storage(): Storage {
  // Throws where storage is blocked (private mode, disabled cookies): callers treat that as a failed save.
  return window.localStorage;
}

/**
 * Browser-local persistence for confirmed rules only. Stored JSON is validated on every read, so a hand-edited or
 * outdated value is ignored instead of crashing the page. Nothing here is shared between browsers or sent anywhere.
 */
export const ALERT_STORAGE_KEY = KEY;

export const alertRepository = {
  load(): AlertRule[] {
    try {
      const text = storage().getItem(KEY);
      if (!text) return [];
      const parsed = listSchema.safeParse(JSON.parse(text));
      return parsed.success ? parsed.data : [];
    } catch {
      return [];
    }
  },

  /** Applies a confirmed operation to the stored list and writes it back. Throws if storage is unavailable or full. */
  commit(operation: Operation): AlertRule[] {
    const current = alertRepository.load();
    if (operation.op !== "create" && !current.some((r) => r.id === operation.rule.id)) {
      throw new RuleMissingError("This rule no longer exists: it was changed in another tab.");
    }
    const next = applyOperation(current, operation);
    storage().setItem(KEY, JSON.stringify(next));
    return next;
  },

  clear() {
    try {
      storage().removeItem(KEY);
    } catch {
      /* nothing to clear */
    }
  },
};
