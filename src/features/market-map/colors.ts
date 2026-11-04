import type { MapScale } from "@/domains/market";

const RAMPS = {
  sequential: ["--scale-seq-0", "--scale-seq-1", "--scale-seq-2", "--scale-seq-3", "--scale-seq-4"],
  diverging: ["--scale-div-0", "--scale-div-1", "--scale-div-2", "--scale-div-3", "--scale-div-4"],
  categorical: ["--scale-cat-0", "--scale-cat-1", "--scale-cat-2"],
} as const;

/** CSS colour for a class index of the scale. `null` (no value) is drawn with the hatched no-data pattern by the caller. */
export function classColor(scale: Pick<MapScale, "kind">, index: number): string {
  const ramp = RAMPS[scale.kind];
  return `var(${ramp[Math.min(index, ramp.length - 1)]})`;
}

export const NO_DATA_PATTERN_ID = "market-map-no-data";
