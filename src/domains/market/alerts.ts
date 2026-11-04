import { z } from "@/shared/lib/zod";
import { marketRows, type MarketRow } from "./metrics";
import { displayOneDecimal } from "./rounding";
import type { Dataset } from "./schema";

/** Explicit business bounds (percent). Growth below -50% or above +100%, attainment outside 50-150%, is not a sensible alert. */
export const THRESHOLD_BOUNDS = {
  growth: { min: -50, max: 100 },
  attainment: { min: 50, max: 150 },
} as const;

export const alertMetricSchema = z.enum(["growth", "attainment"]);
export type AlertMetric = z.infer<typeof alertMetricSchema>;

/**
 * What a user may enter. A threshold that is empty or not a number fails validation; it is never read as 0.
 * `marketIds` is only meaningful (and required) when the scope is "selected".
 */
export const alertRuleInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .max(60, "Name must be 60 characters or fewer")
      // Zero-width and format characters (U+200B ...) survive trim(): count only characters a person can see.
      .refine((n) => n.replace(/[\p{Cf}\p{Z}\s]/gu, "").length >= 2, "Name must be at least 2 characters"),
    scope: z.enum(["all", "selected"]),
    marketIds: z.array(z.string()),
    metric: alertMetricSchema,
    threshold: z.number({ error: "Enter a threshold" }).finite("Enter a threshold"),
    enabled: z.boolean(),
  })
  .superRefine((rule, ctx) => {
    if (rule.scope === "selected" && rule.marketIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["marketIds"], message: "Select at least one market" });
    }
    if (Number.isFinite(rule.threshold) && Math.abs(rule.threshold * 10 - Math.round(rule.threshold * 10)) > 1e-9) {
      // The UI shows one decimal; a finer threshold could flag a market whose displayed value equals it.
      ctx.addIssue({ code: "custom", path: ["threshold"], message: "Use at most one decimal place" });
      return;
    }
    const { min, max } = THRESHOLD_BOUNDS[rule.metric];
    if (Number.isFinite(rule.threshold) && (rule.threshold < min || rule.threshold > max)) {
      ctx.addIssue({
        code: "custom",
        path: ["threshold"],
        message: `${rule.metric === "growth" ? "Growth" : "Attainment"} threshold must be between ${min}% and ${max}%`,
      });
    }
  });

export type AlertRuleInput = z.infer<typeof alertRuleInputSchema>;

export type AlertRule = AlertRuleInput & { id: string; createdAt: string };

export const alertRuleSchema = alertRuleInputSchema.and(z.object({ id: z.string().min(1), createdAt: z.string() }));

/** The one decimal the UI shows (see rounding.ts), so a market never flags at a value that displays equal to its threshold. */
const shown = displayOneDecimal;

export type RuleEvaluation = {
  row: MarketRow;
  /** The metric's value for the period, or null when it cannot be computed (zero denominator). */
  value: number | null;
  /** value < threshold, on the displayed value. A market with no value is never flagged. */
  flagged: boolean;
};

/** Markets in scope for the rule with their value and whether they fall below the threshold, for the given period. */
export function evaluateRule(dataset: Dataset, rule: Pick<AlertRuleInput, "scope" | "marketIds" | "metric" | "threshold">, period: string): RuleEvaluation[] {
  const inScope = (id: string) => rule.scope === "all" || rule.marketIds.includes(id);
  return marketRows(dataset, period)
    .filter((row) => inScope(row.market.id))
    .map((row) => {
      const value = rule.metric === "growth" ? row.metrics.growthPct : row.metrics.attainmentPct;
      return { row, value, flagged: value !== null && shown(value) < rule.threshold };
    });
}

/** Which of the given market ids exist in the dataset (a stored or posted rule must not reference unknown markets). */
export function unknownMarketIds(dataset: Dataset, ids: readonly string[]): string[] {
  const known = new Set(dataset.markets.map((m) => m.id));
  return ids.filter((id) => !known.has(id));
}
