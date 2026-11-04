import type { AxisId, Comparison } from "@/domains/market";
import { formatPercent, formatUsdExact } from "@/shared/lib/format";

const AXIS_TEXT: Record<AxisId, { noun: string; value: (e: Comparison["entities"][number]) => number | null; format: (v: number) => string }> = {
  revenue: { noun: "revenue", value: (e) => e.raw.revenue, format: (v) => formatUsdExact(v) },
  growth: { noun: "year-on-year growth", value: (e) => e.raw.growthPct, format: (v) => formatPercent(v, { signed: true }) },
  attainment: { noun: "forecast attainment", value: (e) => e.raw.attainmentPct, format: (v) => formatPercent(v) },
};

/** One sentence per axis naming the highest and lowest compared entity with their raw values. */
export function summarize(comparison: Comparison): string[] {
  return comparison.axes.flatMap((axis) => {
    const t = AXIS_TEXT[axis.id];
    const ranked = comparison.entities.flatMap((e) => {
      const v = t.value(e);
      return v === null ? [] : [{ name: e.name, v }];
    });
    const sorted = [...ranked].sort((a, b) => b.v - a.v);
    const top = sorted[0];
    const bottom = sorted.at(-1);
    if (!top || !bottom || sorted.length < 2) return [];
    return [`Highest ${t.noun}: ${top.name} (${t.format(top.v)}); lowest: ${bottom.name} (${t.format(bottom.v)}).`];
  });
}
