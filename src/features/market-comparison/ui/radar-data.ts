import type { Comparison } from "@/domains/market";

export type RadarRow = { axisId: string; axis: string } & Record<string, number | string | null>;

/** Recharts rows: one per axis, one key per entity. A missing value stays null: it is never drawn as a fake 0. */
export function radarData(comparison: Comparison): RadarRow[] {
  return comparison.axes.map((axis) => ({
    axisId: axis.id,
    axis: axis.label,
    ...Object.fromEntries(comparison.entities.map((e) => [e.id, e.scores[axis.id]])),
  }));
}
