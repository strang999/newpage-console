"use client";

import { useEffect, useMemo, useState } from "react";
import { applyLive, initialLiveState, nextLiveState, type Dataset, type LiveState } from "@/domains/market";

export const LIVE_INTERVAL_MS = 2500;

/**
 * The dataset the dashboard draws. With live mode off it is the supplied dataset itself. With it on, a simulated feed
 * nudges the latest month's actuals every few seconds (see `domains/market/live.ts`). Only the data changes: the URL,
 * sorting, scroll positions and open panels belong to other state and are never touched. Ticks pause while the tab is hidden.
 */
export function useLiveDataset(base: Dataset, enabled: boolean): { dataset: Dataset; tick: number; updatedAt: Date | null } {
  const [live, setLive] = useState<{ state: LiveState; at: Date | null }>({ state: initialLiveState, at: null });

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      setLive((current) => ({ state: nextLiveState(base, current.state), at: new Date() }));
    }, LIVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, base]);

  const dataset = useMemo(() => (enabled ? applyLive(base, live.state) : base), [enabled, base, live.state]);
  return { dataset, tick: enabled ? live.state.tick : 0, updatedAt: enabled ? live.at : null };
}
