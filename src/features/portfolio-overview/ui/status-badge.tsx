import { STATUS_META, type MarketStatus } from "@/domains/market";
import { StatusBadge as Badge } from "@/shared/ui/status-badge";

export function StatusBadge({ status }: { status: MarketStatus }) {
  const meta = STATUS_META[status];
  return <Badge tone={meta.tone} label={meta.label} />;
}
