import type { DoneMeta } from "../model/events";

const LEVELS = {
  high: { label: "High confidence", bars: 3, color: "var(--color-status-on-track)", text: "The assistant is confident in this answer. Check the cited figures to verify it." },
  medium: { label: "Medium confidence", bars: 2, color: "var(--color-status-at-risk)", text: "The assistant is moderately confident. Part of this answer is interpretation; compare it with the cited figures." },
  low: { label: "Low confidence", bars: 1, color: "var(--color-status-off-track)", text: "The assistant is not confident. Treat this as a lead, not a finding, and verify it against the cited data." },
} as const;

function Bars({ filled, color }: { filled: number; color: string }) {
  return (
    <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <rect key={i} x={i * 8} y={10 - i * 4} width="6" height={4 + i * 4} rx="1" fill={i < filled ? color : "none"} stroke={color} strokeWidth="1.25" />
      ))}
    </svg>
  );
}

/**
 * Confidence and answer-kind cues, shown only once the stream has finished with a `done` event.
 * Abstention and low confidence are valid outcomes with their own copy, distinct from transport errors.
 */
export function TrustNotice({ meta }: { meta: DoneMeta }) {
  if (meta.kind === "abstain") {
    return (
      <div className="mt-3 rounded-sm border border-dashed p-2 text-sm" style={{ borderColor: "var(--color-ai-border)" }} data-testid="trust-notice" data-kind="abstain">
        <p className="flex items-center gap-2 font-semibold">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16.5v.5" />
          </svg>
          Can&apos;t answer from this data
        </p>
        <p className="mt-1 text-xs">The question goes beyond what the dataset covers, so the assistant did not guess. Nothing in this answer is an estimate.</p>
      </div>
    );
  }
  if (meta.kind === "error") {
    return (
      <p role="alert" className="mt-3 text-sm font-medium" data-testid="trust-notice" data-kind="error">
        The assistant reported a problem with this answer. Do not rely on it.
      </p>
    );
  }
  const level = LEVELS[meta.confidence];
  return (
    <div className="mt-3 rounded-sm bg-surface p-2 text-[var(--color-text)]" data-testid="trust-notice" data-kind={meta.kind} data-confidence={meta.confidence}>
      <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: level.color }}>
        <Bars filled={level.bars} color={level.color} />
        {level.label}
        {meta.kind === "low_confidence" && <span className="font-normal text-[var(--color-text-muted)]">· uncertain answer</span>}
      </p>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">{level.text}</p>
    </div>
  );
}
