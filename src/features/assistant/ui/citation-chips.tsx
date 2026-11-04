import { resolveCitation, type CitationInput, type Dataset } from "@/domains/market";

/** One chip per distinct citation. Each opens the evidence drawer; unverifiable ones say so instead of looking normal. */
export function CitationChips({ dataset, citations, onOpen }: { dataset: Dataset; citations: readonly CitationInput[]; onOpen: (c: CitationInput) => void }) {
  const unique = [...new Map(citations.map((c) => [JSON.stringify(c), c])).values()];
  if (unique.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold">Evidence ({unique.length})</p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {unique.map((c) => {
          const e = resolveCitation(dataset, c);
          const ok = e.status === "resolved";
          return (
            <li key={JSON.stringify(c)}>
              <button
                type="button"
                onClick={() => onOpen(c)}
                aria-haspopup="dialog"
                className="inline-flex items-center gap-1 rounded-full border bg-surface px-2.5 py-0.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-sunken)]"
                style={{ borderColor: ok ? "var(--color-ai-border)" : "var(--color-status-at-risk)" }}
              >
                {ok ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 20h16M7 16V9m5 7V5m5 11v-5" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 4l9 16H3L12 4zM12 10v4" />
                  </svg>
                )}
                {ok ? (c.label ?? e.title) : `Unresolved reference${c.label ? `: ${c.label}` : ""}`}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
