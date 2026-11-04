"use client";

import { useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { CitationInput, Dataset, EvidenceTarget } from "@/domains/market";
import { useAssistant } from "../model/use-assistant";
import type { ViewContext } from "../model/context";
import { SUGGESTED_PROMPTS, viewSuggestions } from "../model/prompts";
import { EvidenceDrawer } from "./evidence-drawer";
import { MessageView } from "./message-view";

const MAX_LENGTH = 500;

/** `view` is what the dashboard shows right now (`label` is its human name); questions are asked in that context. */
export function AssistantPanel({ dataset, onOpenEvidence, view }: { dataset: Dataset; onOpenEvidence: (target: EvidenceTarget) => void; view?: { context: ViewContext; label: string } }) {
  const { state, busy, ask, stop, retry } = useAssistant();
  const [evidence, setEvidence] = useState<CitationInput | null>(null);
  const [draft, setDraft] = useState("");
  const inputId = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);

  // Follow the answer only while the reader is already at the bottom.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [state]);

  // One announcement per terminal state, never per token: the text is empty while a message is still generating.
  const last = state.messages.at(-1);
  // Errors are announced by their own role="alert"; the status region covers the other terminal states only.
  const announcement =
    last?.status === "complete" && last.meta?.kind !== "error"
      ? "Answer complete."
      : last?.status === "stopped"
        ? "Generation stopped."
        : last?.status === "incomplete"
          ? "The response ended before it finished."
          : "";

  // Suggestions that depend on what the dashboard is showing now; the fixed ones below them do not.
  const viewPrompts = view ? viewSuggestions(view.label, view.context) : [];

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (busy || !draft.trim()) return;
    ask(draft, view?.context);
    setDraft("");
    composerRef.current?.focus();
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <section aria-labelledby="assistant-heading" className="flex h-full min-h-[420px] flex-col rounded-md border border-[var(--color-ai-border)] bg-surface">
      <header className="border-b border-border px-4 py-3">
        <h2 id="assistant-heading" className="text-lg font-semibold">
          Assistant
        </h2>
        <p className="text-xs text-muted">AI-generated answers to fixed example questions. Verify against the dashboard.</p>
      </header>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        role="region"
        aria-label="Conversation"
        tabIndex={0}
        className="flex-1 overflow-y-auto px-4 py-3"
      >
        {state.messages.length === 0 ? (
          <div>
            <p className="text-sm text-muted">Ask a question about the data, or try one of these:</p>
            <ul className="mt-2 flex flex-col gap-2">
              {viewPrompts.map((p) => (
                <li key={p.text}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      ask(p.text, view?.context);
                      composerRef.current?.focus();
                    }}
                    className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-[var(--color-ai-surface)] disabled:opacity-50"
                    style={{ borderColor: "var(--color-ai-border)" }}
                  >
                    {p.text}
                    <span className="block text-xs text-muted">{p.note}</span>
                  </button>
                </li>
              ))}
              {SUGGESTED_PROMPTS.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      ask(p.text, view?.context);
                      composerRef.current?.focus();
                    }}
                    className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-sunken)] disabled:opacity-50"
                    style={{ borderColor: "var(--color-border-strong)" }}
                  >
                    {p.text}
                    <span className="block text-xs text-muted">{p.note}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="flex flex-col gap-4">
            {state.messages.map((m) => (
              <MessageView key={m.id} message={m} dataset={dataset} onRetry={retry} onOpenCitation={setEvidence} />
            ))}
          </ol>
        )}
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {view && (
        <p className="border-t border-border px-3 pt-2 text-xs text-muted" data-testid="assistant-context">
          Asking about <strong className="font-semibold text-[var(--color-text)]">{view.label}</strong> (what the dashboard shows now). “This” and “here” mean this view.
        </p>
      )}
      <form onSubmit={submit} className={view ? "px-3 pb-3 pt-1" : "border-t border-border p-3"}>
        <label htmlFor={inputId} className="text-sm font-medium">
          Ask about the data
        </label>
        <div className="mt-1 flex gap-2">
          <textarea
            id={inputId}
            ref={composerRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={MAX_LENGTH}
            rows={2}
            className="min-w-0 flex-1 resize-none rounded-sm border bg-surface px-2 py-1 text-sm"
            style={{ borderColor: "var(--color-border-strong)" }}
          />
          {busy ? (
            <button type="button" onClick={stop} className="self-end rounded-sm border px-3 py-1.5 text-sm font-medium" style={{ borderColor: "var(--color-status-off-track)", color: "var(--color-status-off-track)" }}>
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim()}
              className="self-end rounded-sm bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-contrast)] disabled:opacity-50"
            >
              Send
            </button>
          )}
        </div>
      </form>
      {evidence && <EvidenceDrawer dataset={dataset} citation={evidence} onClose={() => setEvidence(null)} onOpenInDashboard={onOpenEvidence} />}
    </section>
  );
}
