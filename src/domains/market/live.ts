import type { Dataset } from "./schema";

/**
 * A simulated feed for the "live" mode: a small, bounded random walk on the latest month's actuals and units. It is
 * deterministic (seeded by tick and fact), pure, and touches nothing else: forecasts, prior-year values, every earlier
 * month and the supplied status snapshot stay exactly as supplied.
 */
export type LiveState = { tick: number; drift: Readonly<Record<string, number>> };

export const LIVE_MAX_DRIFT = 0.03; // +-3% of the supplied actual
const STEP = 0.012; // each tick moves a fact by at most +-0.6%

export const initialLiveState: LiveState = { tick: 0, drift: {} };

/** Small fast seeded PRNG (mulberry32) in [0, 1). */
function random(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const keyOf = (marketId: string, productId: string) => `${marketId}|${productId}`;

/** One tick later: every latest-month fact moves a little, clamped to +-3% of what was supplied. */
export function nextLiveState(dataset: Dataset, previous: LiveState): LiveState {
  const tick = previous.tick + 1;
  const drift: Record<string, number> = {};
  for (const fact of dataset.series) {
    if (fact.period !== dataset.meta.latestPeriod) continue;
    const key = keyOf(fact.marketId, fact.productId);
    const step = (random(hash(key) ^ Math.imul(tick, 0x9e3779b1)) - 0.5) * STEP;
    drift[key] = Math.max(-LIVE_MAX_DRIFT, Math.min(LIVE_MAX_DRIFT, (previous.drift[key] ?? 0) + step));
  }
  return { tick, drift };
}

/** The dataset as it looks at this live state. At tick 0 (no drift) it is the supplied dataset itself. */
export function applyLive(dataset: Dataset, state: LiveState): Dataset {
  if (state.tick === 0) return dataset;
  return {
    ...dataset,
    series: dataset.series.map((fact) => {
      if (fact.period !== dataset.meta.latestPeriod) return fact;
      const d = state.drift[keyOf(fact.marketId, fact.productId)] ?? 0;
      return { ...fact, actual: Math.round(fact.actual * (1 + d)), units: Math.round(fact.units * (1 + d)) };
    }),
  };
}
