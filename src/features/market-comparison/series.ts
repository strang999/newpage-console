/** One visual identity per compared entity: colour plus a dash pattern, so lines are distinguishable without colour. */
export const SERIES = [
  { color: "var(--series-1)", dash: undefined, label: "solid line" },
  { color: "var(--series-2)", dash: "7 4", label: "dashed line" },
  { color: "var(--series-3)", dash: "2 4", label: "dotted line" },
  { color: "var(--series-4)", dash: "10 4 2 4", label: "dash-dot line" },
] as const;

export function seriesFor(index: number) {
  return SERIES[index % SERIES.length] ?? SERIES[0];
}
