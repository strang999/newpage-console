import type { MarketStatus } from "@/domains/market";

const META: Record<MarketStatus, { label: string; color: string; background: string; icon: string }> = {
  on_track: {
    label: "On track",
    color: "var(--color-status-on-track)",
    background: "var(--color-status-on-track-soft)",
    icon: "M5 13l4 4L19 7",
  },
  at_risk: {
    label: "At risk",
    color: "var(--color-status-at-risk)",
    background: "var(--color-status-at-risk-soft)",
    icon: "M12 4l9 16H3L12 4zM12 10v4M12 17v.5",
  },
  off_track: {
    label: "Off track",
    color: "var(--color-status-off-track)",
    background: "var(--color-status-off-track-soft)",
    icon: "M6 6l12 12M18 6L6 18",
  },
};

/** Status is communicated by icon shape and text, never by colour alone. */
export function StatusBadge({ status }: { status: MarketStatus }) {
  const meta = META[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium"
      style={{ color: meta.color, background: meta.background }}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={meta.icon} />
      </svg>
      {meta.label}
    </span>
  );
}
