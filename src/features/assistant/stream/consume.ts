import { EventSourceParserStream } from "eventsource-parser/stream";
import { streamEventSchema, type DoneMeta } from "../model/events";

export type FailureCode =
  | "network" // fetch rejected or the body stream broke
  | "timeout" // no first event, or the overall deadline passed
  | "http" // non-2xx response
  | "content_type" // 2xx but not text/event-stream
  | "no_body" // streaming body unsupported or missing
  | "protocol" // a frame was not valid JSON or not a known event
  | "server_error"; // the supplied `error` event

export type StreamFailure = {
  code: FailureCode;
  message: string;
  /** Whether the failure class is safe to retry automatically when nothing was received yet. */
  retryable: boolean;
  status?: number;
  /** Parsed Retry-After, milliseconds. */
  retryAfterMs?: number;
};

/** The terminal outcome of exactly one request attempt. */
export type AttemptResult =
  | { kind: "done"; meta: DoneMeta; receivedTokens: boolean }
  | { kind: "failed"; failure: StreamFailure; receivedTokens: boolean }
  /** The connection ended (EOF, a broken stream or an idle timeout) after tokens without a `done` event. */
  | { kind: "incomplete"; receivedTokens: boolean; timedOut?: boolean }
  | { kind: "aborted"; receivedTokens: boolean };

export type AttemptTimeouts = { firstEventMs: number; idleMs: number };

export type AttemptOptions = {
  question: string;
  /** The caller's signal (user Stop, unmount, overall deadline). Distinct from this attempt's own timeouts. */
  signal: AbortSignal;
  timeouts?: AttemptTimeouts;
  onToken: (value: string) => void;
  fetchImpl?: typeof fetch;
  endpoint?: string;
};

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export function parseRetryAfter(header: string | null, now: number = Date.now()): number | undefined {
  if (!header || header.trim() === "") return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/**
 * One POST /api/chat attempt. Framing is delegated to eventsource-parser; this function owns status/content-type
 * checks, UTF-8 decoding, schema validation, timeouts and classification. It never retries and never throws for
 * expected failures. A timeout (no first event, or no activity while streaming) cancels only this attempt.
 */
export async function runAttempt(options: AttemptOptions): Promise<AttemptResult> {
  const { signal: callerSignal, timeouts } = options;
  const inner = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const arm = (ms: number | undefined) => {
    clearTimeout(timer);
    if (ms === undefined) return;
    timer = setTimeout(() => {
      timedOut = true;
      inner.abort();
    }, ms);
  };
  const forwardAbort = () => inner.abort();
  if (callerSignal.aborted) inner.abort();
  else callerSignal.addEventListener("abort", forwardAbort, { once: true });

  arm(timeouts?.firstEventMs);
  try {
    const result = await attemptCore(options, inner.signal, () => arm(timeouts?.idleMs));
    if (!timedOut) return result;
    // The caller did not ask to stop; the attempt's own timer fired.
    if (callerSignal.aborted) return { kind: "aborted", receivedTokens: result.receivedTokens };
    return result.receivedTokens
      ? { kind: "incomplete", receivedTokens: true, timedOut: true }
      : { kind: "failed", receivedTokens: false, failure: { code: "timeout", message: "The assistant did not respond in time.", retryable: true } };
  } finally {
    clearTimeout(timer);
    callerSignal.removeEventListener("abort", forwardAbort);
  }
}

async function attemptCore(
  { question, onToken, fetchImpl = fetch, endpoint = "/api/chat" }: AttemptOptions,
  signal: AbortSignal,
  onActivity: () => void,
): Promise<AttemptResult> {
  let receivedTokens = false;
  if (signal.aborted) return { kind: "aborted", receivedTokens };

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ question }),
      signal,
    });
  } catch {
    if (signal.aborted) return { kind: "aborted", receivedTokens };
    return { kind: "failed", receivedTokens, failure: { code: "network", message: "Could not reach the assistant.", retryable: true } };
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    return {
      kind: "failed",
      receivedTokens,
      failure: {
        code: "http",
        status: response.status,
        message: `The assistant returned an error (HTTP ${response.status}).`,
        retryable: RETRYABLE_STATUS.has(response.status),
        retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
      },
    };
  }
  if (!(response.headers.get("content-type") ?? "").toLowerCase().startsWith("text/event-stream")) {
    void response.body?.cancel().catch(() => undefined);
    return { kind: "failed", receivedTokens, failure: { code: "content_type", message: "The assistant sent an unexpected response type.", retryable: false } };
  }
  if (!response.body) {
    return { kind: "failed", receivedTokens, failure: { code: "no_body", message: "Streaming responses are not supported here.", retryable: false } };
  }

  const reader = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream({ onError: "terminate", maxBufferSize: 1_000_000 }))
    .getReader();

  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<{ data: string }>;
      try {
        chunk = await reader.read();
      } catch {
        if (signal.aborted) return { kind: "aborted", receivedTokens };
        return receivedTokens
          ? { kind: "incomplete", receivedTokens }
          : { kind: "failed", receivedTokens, failure: { code: "network", message: "The connection was interrupted.", retryable: true } };
      }
      if (chunk.done) {
        if (signal.aborted) return { kind: "aborted", receivedTokens };
        return { kind: "incomplete", receivedTokens };
      }
      onActivity();

      let parsed: ReturnType<typeof streamEventSchema.safeParse>;
      try {
        parsed = streamEventSchema.safeParse(JSON.parse(chunk.value.data));
      } catch {
        return { kind: "failed", receivedTokens, failure: { code: "protocol", message: "The assistant sent a malformed event.", retryable: false } };
      }
      if (!parsed.success) {
        return { kind: "failed", receivedTokens, failure: { code: "protocol", message: "The assistant sent an unexpected event.", retryable: false } };
      }

      const event = parsed.data;
      if (event.type === "token") {
        receivedTokens = true;
        onToken(event.value);
      } else if (event.type === "done") {
        return { kind: "done", receivedTokens, meta: { kind: event.kind, citations: event.citations, confidence: event.confidence } };
      } else {
        return { kind: "failed", receivedTokens, failure: { code: "server_error", message: event.message, retryable: false } };
      }
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}
