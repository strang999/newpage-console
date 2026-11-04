import { describe, expect, it } from "vitest";
import raw from "@/data/starter/data.json";
import { applyLive, initialLiveState, LIVE_MAX_DRIFT, nextLiveState, type LiveState } from "./live";
import { portfolioHealth } from "./metrics";
import { datasetSchema } from "./schema";

const d = datasetSchema.parse(raw);

function advance(n: number): LiveState {
  let s = initialLiveState;
  for (let i = 0; i < n; i += 1) s = nextLiveState(d, s);
  return s;
}

describe("live simulation", () => {
  it("at tick 0 it is the supplied dataset itself, not a copy", () => {
    expect(applyLive(d, initialLiveState)).toBe(d);
  });

  it("changes only the latest month's actuals and units; everything else is untouched", () => {
    const live = applyLive(d, advance(5));
    expect(live.series).toHaveLength(d.series.length);
    let changed = 0;
    live.series.forEach((f, i) => {
      const base = d.series[i];
      if (!base) throw new Error("length mismatch");
      expect(f.forecast).toBe(base.forecast);
      expect(f.priorYear).toBe(base.priorYear);
      if (f.period !== d.meta.latestPeriod) expect(f).toBe(base);
      else if (f.actual !== base.actual) changed += 1;
    });
    expect(changed).toBeGreaterThan(40); // most of the 65 latest-month facts moved
    expect(live.markets).toBe(d.markets); // the supplied snapshot (status, share) is not simulated
  });

  it("stays within +-3% of the supplied value however long it runs", () => {
    const live = applyLive(d, advance(400));
    live.series.forEach((f, i) => {
      const base = d.series[i];
      if (!base || f.period !== d.meta.latestPeriod) return;
      expect(Math.abs(f.actual / base.actual - 1)).toBeLessThanOrEqual(LIVE_MAX_DRIFT + 1e-3);
    });
  });

  it("is deterministic: the same tick always gives the same numbers", () => {
    expect(advance(7)).toEqual(advance(7));
    expect(applyLive(d, advance(7)).series).toEqual(applyLive(d, advance(7)).series);
    expect(advance(7)).not.toEqual(advance(8));
  });

  it("the dashboard's derived totals follow: portfolio revenue moves with the facts, never the earlier months", () => {
    const before = portfolioHealth(d).metrics.actual;
    const live = applyLive(d, advance(3));
    const after = portfolioHealth(live).metrics.actual;
    expect(after).not.toBe(before);
    expect(Math.abs(after / before - 1)).toBeLessThan(LIVE_MAX_DRIFT);
    expect(portfolioHealth(live, "2026-04").metrics.actual).toBe(portfolioHealth(d, "2026-04").metrics.actual);
  });
});
