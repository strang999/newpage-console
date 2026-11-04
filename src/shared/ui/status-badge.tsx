export type Tone = "positive" | "warning" | "critical" | "neutral";

const TONES: Record<Tone, { color: string; background: string; icon: string }> = {
  positive: { color: "var(--color-status-on-track)", background: "var(--color-status-on-track-soft)", icon: "M5 13l4 4L19 7" },
  warning: { color: "var(--color-status-at-risk)", background: "var(--color-status-at-risk-soft)", icon: "M12 4l9 16H3L12 4zM12 10v4M12 17v.5" },
  critical: { color: "var(--color-status-off-track)", background: "var(--color-status-off-track-soft)", icon: "M6 6l12 12M18 6L6 18" },
  neutral: { color: "var(--color-status-neutral)", background: "var(--color-status-neutral-soft)", icon: "M6 12h12" },
};

/** A status pill. The meaning is carried by the label and the icon shape; colour only reinforces it. */
export function StatusBadge({ tone, label }: { tone: Tone; label: string }) {
  const t = TONES[tone];
  return (
    <span className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium" style={{ color: t.color, background: t.background }}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={t.icon} />
      </svg>
      {label}
    </span>
  );
}
