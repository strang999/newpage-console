import { metricsFor, type Metrics } from "./metrics";
import type { Dataset } from "./schema";
import type { CompareType } from "./view-state";

export type AxisId = "revenue" | "growth" | "attainment";

export type ComparisonAxis = {
  id: AxisId;
  label: string;
  /** Bounds of the whole peer population for the period (all markets, or all regions), not of the selection. */
  min: number;
  max: number;
  /** min equals max: every entity sits at the neutral 50 and the UI says why. */
  degenerate: boolean;
};

export type ComparisonEntity = {
  id: string;
  name: string;
  raw: { revenue: number; growthPct: number | null; attainmentPct: number | null };
  /** 0-100 position on each axis, or null where the raw value is missing (growth/attainment with a zero denominator). */
  scores: Record<AxisId, number | null>;
  /** Supplied latest-period snapshot; markets only, and never plotted. */
  sharePct: number | null;
};

export type Comparison = {
  type: CompareType;
  period: string;
  populationSize: number;
  axes: ComparisonAxis[];
  entities: ComparisonEntity[];
};

type Candidate = { id: string; name: string; metrics: Metrics; sharePct: number | null };

function population(dataset: Dataset, type: CompareType, period: string): Candidate[] {
  if (type === "market") {
    return dataset.markets.map((m) => ({
      id: m.id,
      name: m.name,
      metrics: metricsFor(dataset, { period, marketId: m.id }),
      sharePct: m.kpis.sharePct,
    }));
  }
  return dataset.regions.map((r) => ({ id: r.id, name: r.name, metrics: metricsFor(dataset, { period, regionId: r.id }), sharePct: null }));
}

const AXES: { id: AxisId; label: string; value: (m: Metrics) => number | null }[] = [
  { id: "revenue", label: "Revenue", value: (m) => m.actual },
  { id: "growth", label: "YoY growth", value: (m) => m.growthPct },
  { id: "attainment", label: "Forecast attainment", value: (m) => m.attainmentPct },
];

/**
 * Radar model. Each axis is normalised 0-100 over the whole peer population of the period, so adding or removing a
 * compared entity never moves another entity's position. Negative growth is not clipped (the population minimum
 * can be negative). Raw values are always returned next to the scores.
 */
export function buildComparison(dataset: Dataset, input: { type: CompareType; ids: readonly string[]; period: string }): Comparison {
  const pop = population(dataset, input.type, input.period);

  const axes: ComparisonAxis[] = AXES.map((axis) => {
    const values = pop.map((c) => axis.value(c.metrics)).filter((v): v is number => v !== null);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { id: axis.id, label: axis.label, min, max, degenerate: values.length === 0 || min === max };
  });

  const score = (axis: ComparisonAxis, value: number | null): number | null => {
    if (value === null) return null;
    if (axis.degenerate) return 50;
    return ((value - axis.min) / (axis.max - axis.min)) * 100;
  };

  const entities = input.ids.flatMap((id): ComparisonEntity[] => {
    const c = pop.find((p) => p.id === id);
    if (!c) return [];
    const [revenueAxis, growthAxis, attainmentAxis] = axes;
    if (!revenueAxis || !growthAxis || !attainmentAxis) return [];
    const scores: Record<AxisId, number | null> = {
      revenue: score(revenueAxis, c.metrics.actual),
      growth: score(growthAxis, c.metrics.growthPct),
      attainment: score(attainmentAxis, c.metrics.attainmentPct),
    };
    return [{ id: c.id, name: c.name, raw: { revenue: c.metrics.actual, growthPct: c.metrics.growthPct, attainmentPct: c.metrics.attainmentPct }, scores, sharePct: c.sharePct }];
  });

  return { type: input.type, period: input.period, populationSize: pop.length, axes, entities };
}
