"use client";

import { useEffect, useRef } from "react";
import { formatPeriodLabel, type Dataset, type EvidenceTarget, type CitationInput, type Metrics, type ResolvedEvidence, resolveCitation, STATUS_META } from "@/domains/market";
import { formatInteger, formatPercent, formatUsdExact } from "@/shared/lib/format";
import { StatusBadge } from "@/shared/ui/status-badge";

const ROWS: { label: string; value: (m: Metrics) => string }[] = [
  { label: "Actual revenue", value: (m) => formatUsdExact(m.actual) },
  { label: "Forecast", value: (m) => formatUsdExact(m.forecast) },
  { label: "Forecast attainment", value: (m) => formatPercent(m.attainmentPct) },
  { label: "Gap to forecast", value: (m) => formatUsdExact(m.gap) },
  { label: "Prior year", value: (m) => formatUsdExact(m.priorYear) },
  { label: "Growth vs prior year", value: (m) => formatPercent(m.growthPct, { signed: true }) },
  { label: "Units", value: (m) => formatInteger(m.units) },
];

/** Closes via the native dialog API when it exists; otherwise (older engines, jsdom) mimic it, including the close event. */
function closeDialog(el: HTMLDialogElement | null) {
  if (!el) return;
  if (typeof el.close === "function") el.close();
  else {
    el.removeAttribute("open");
    el.dispatchEvent(new Event("close"));
  }
}

export function EvidenceDrawer({
  dataset,
  citation,
  onClose,
  onOpenInDashboard,
}: {
  dataset: Dataset;
  citation: CitationInput;
  onClose: () => void;
  onOpenInDashboard: (target: EvidenceTarget) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const evidence: ResolvedEvidence = resolveCitation(dataset, citation);
  const latest = formatPeriodLabel(dataset.meta.latestPeriod);

  // showModal gives a real modal: focus is trapped, Escape closes, and focus returns to the chip that opened it.
  useEffect(() => {
    const el = ref.current;
    if (!el || el.open) return;
    if (typeof el.showModal === "function") el.showModal();
    else el.setAttribute("open", "");
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="evidence-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && closeDialog(ref.current)}
      className="fixed inset-y-0 left-auto right-0 m-0 h-full max-h-none w-[min(30rem,100vw)] max-w-none overflow-y-auto border-l border-border bg-surface p-0 text-[var(--color-text)] shadow-2xl backdrop:bg-black/40"
    >
      <div className="flex min-h-full flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Evidence</p>
            <h2 id="evidence-title" className="text-lg font-semibold">
              {evidence.status === "resolved" ? evidence.title : "Unresolved reference"}
            </h2>
            {citation.label && <p className="text-sm text-[var(--color-text-muted)]">Cited as “{citation.label}”</p>}
          </div>
          <button type="button" onClick={() => closeDialog(ref.current)} className="rounded-sm border px-2 py-1 text-sm" style={{ borderColor: "var(--color-border-strong)" }}>
            Close
          </button>
        </header>

        {evidence.status === "unresolved" ? (
          <div className="flex-1 px-5 py-4">
            <p role="alert" className="rounded-sm border p-3 text-sm" style={{ borderColor: "var(--color-status-at-risk)", background: "var(--color-status-at-risk-soft)", color: "var(--color-status-at-risk)" }}>
              This reference could not be verified against the dataset. {evidence.reason}
            </p>
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">The assistant cited a source that does not exist in the data. Do not rely on the claim it supports.</p>
            <pre className="mt-3 overflow-x-auto rounded-sm bg-[var(--color-surface-sunken)] p-2 text-xs">{JSON.stringify(citation, null, 2)}</pre>
          </div>
        ) : (
          <div className="flex-1 px-5 py-4">
            <p className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-sm border px-2 py-0.5 font-semibold" style={{ borderColor: "var(--color-border-strong)" }}>
                Source: dataset
              </span>
              <span className="text-[var(--color-text-muted)]">Derived from monthly facts. Not AI-generated.</span>
            </p>

            <h3 className="mt-4 text-sm font-semibold">Values</h3>
            <div role="region" aria-label="Evidence values" tabIndex={0} className="mt-1 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Exact values for {evidence.title}, with the previous month for context</caption>
                <thead>
                  <tr className="border-b border-border text-xs text-[var(--color-text-muted)]">
                    <th scope="col" className="py-1.5 pr-2 text-left font-semibold">
                      Metric
                    </th>
                    <th scope="col" className="px-2 py-1.5 text-right font-semibold">
                      {formatPeriodLabel(evidence.period)}
                    </th>
                    {evidence.previous && (
                      <th scope="col" className="py-1.5 pl-2 text-right font-semibold">
                        {formatPeriodLabel(evidence.previous.period)}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row) => (
                    <tr key={row.label} className="border-b border-border last:border-b-0">
                      <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                        {row.label}
                      </th>
                      <td className="px-2 py-1.5 text-right font-medium tabular-nums">{row.value(evidence.metrics)}</td>
                      {evidence.previous && <td className="py-1.5 pl-2 text-right tabular-nums text-[var(--color-text-muted)]">{row.value(evidence.previous.metrics)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {evidence.snapshot && (
              <section aria-labelledby="snapshot-heading" className="mt-5 rounded-sm border border-dashed p-3" style={{ borderColor: "var(--color-border-strong)" }}>
                <h3 id="snapshot-heading" className="text-sm font-semibold">
                  Supplied snapshot, {latest}
                </h3>
                <p className="text-xs text-[var(--color-text-muted)]">Status and share exist only for the latest period. They are supplied with the dataset, not derived from the monthly facts above.</p>
                <p className="mt-2 flex items-center gap-3 text-sm">
                  <StatusBadge tone={STATUS_META[evidence.snapshot.status].tone} label={STATUS_META[evidence.snapshot.status].label} />
                  <span>Market share {formatPercent(evidence.snapshot.sharePct)}</span>
                </p>
                {evidence.snapshot.anomalies.map((a) => (
                  <p key={a.period} className="mt-2 text-sm">
                    <span className="font-medium">{formatPeriodLabel(a.period)} (supplied note):</span> {a.note}
                  </p>
                ))}
              </section>
            )}

            {evidence.notes.length > 0 && (
              <ul className="mt-4 list-disc pl-5 text-xs text-[var(--color-text-muted)]">
                {evidence.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {evidence.status === "resolved" && (
          <footer className="border-t border-border px-5 py-3">
            <button
              type="button"
              onClick={() => {
                onOpenInDashboard(evidence.target);
                closeDialog(ref.current);
              }}
              className="w-full rounded-sm px-3 py-2 text-sm font-semibold"
              style={{ background: "var(--color-accent)", color: "var(--color-accent-contrast)" }}
            >
              Open in dashboard
            </button>
          </footer>
        )}
      </div>
    </dialog>
  );
}
