import type { MarketStatus } from "./schema";

/** Label and semantic tone of each supplied status. UI maps the tone to colour plus an icon. */
export const STATUS_META: Readonly<Record<MarketStatus, { label: string; tone: "positive" | "warning" | "critical" }>> = {
  on_track: { label: "On track", tone: "positive" },
  at_risk: { label: "At risk", tone: "warning" },
  off_track: { label: "Off track", tone: "critical" },
};
