import type { MarketStatus } from "@/domains/market";
import { StatusBadge as Badge, type Tone } from "@/shared/ui/status-badge";

const META: Record<MarketStatus, { label: string; tone: Tone }> = {
  on_track: { label: "On track", tone: "positive" },
  at_risk: { label: "At risk", tone: "warning" },
  off_track: { label: "Off track", tone: "critical" },
};

export function StatusBadge({ status }: { status: MarketStatus }) {
  return <Badge tone={META[status].tone} label={META[status].label} />;
}
