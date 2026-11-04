import type { CitationInput, Dataset } from "@/domains/market";
import type { Message } from "../model/reducer";
import { CitationChips } from "./citation-chips";
import { TrustNotice } from "./trust-notice";

const STATUS_COPY: Record<Message["status"], string | null> = {
  connecting: "Connecting…",
  streaming: "Generating… evidence pending",
  complete: null,
  stopped: "Stopped. Evidence is unavailable for a stopped answer.",
  incomplete: "The response ended before it finished. Evidence is unavailable.",
  error: null,
};

export function MessageView({
  message,
  dataset,
  onRetry,
  onOpenCitation,
}: {
  message: Message;
  dataset: Dataset;
  onRetry: (id: string) => void;
  onOpenCitation: (citation: CitationInput) => void;
}) {
  const active = message.status === "connecting" || message.status === "streaming";
  const canRetry = message.status === "stopped" || message.status === "incomplete" || message.status === "error";
  const statusCopy =
    message.status === "connecting" && message.autoRetries > 0
      ? `Connection problem. Retrying automatically (attempt ${message.autoRetries + 1} of 3)…`
      : STATUS_COPY[message.status];

  return (
    <li className="flex flex-col gap-2">
      <div className="self-end rounded-md bg-[var(--color-surface-sunken)] px-3 py-2 text-sm">
        <span className="sr-only">You asked: </span>
        {message.question}
      </div>

      <article
        aria-label="Assistant answer"
        aria-busy={active}
        className="rounded-md border-l-4 border-[var(--color-ai-border)] bg-[var(--color-ai-surface)] p-3 text-[var(--color-ai-text)]"
      >
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide">AI-generated · not source data</p>

        {message.prior.map((prior) => (
          <details key={prior.attemptId} className="mb-2 text-xs">
            <summary className="cursor-pointer">Earlier attempt ({prior.status}), kept separate</summary>
            <p className="mt-1 whitespace-pre-wrap opacity-80">{prior.text}</p>
          </details>
        ))}

        {message.text && <p className="whitespace-pre-wrap text-sm">{message.text}</p>}

        {statusCopy && (
          <p className="mt-2 text-xs" data-testid="answer-status">
            {statusCopy}
          </p>
        )}
        {message.status === "error" && message.failure && (
          <p role="alert" className="mt-2 text-sm font-medium">
            {message.failure.message}
          </p>
        )}
        {message.status === "complete" && message.meta && (
          <>
            <TrustNotice meta={message.meta} />
            <CitationChips dataset={dataset} citations={message.meta.citations} onOpen={onOpenCitation} />
            <p className="mt-2 text-xs" data-testid="answer-status">
              Answer complete.
            </p>
          </>
        )}

        {canRetry && (
          <button
            type="button"
            onClick={() => onRetry(message.id)}
            className="mt-2 rounded-sm border border-[var(--color-ai-border)] bg-surface px-3 py-1 text-sm font-medium"
          >
            Retry from the beginning
          </button>
        )}
      </article>
    </li>
  );
}
