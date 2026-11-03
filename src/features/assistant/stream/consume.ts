import { EventSourceParserStream } from "eventsource-parser/stream";
import { streamEventSchema, type DoneMeta } from "../model/events";

export type FailureCode =
  | "network" // fetch rejected or the body stream broke
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
  /** The connection ended (EOF or a broken stream) after tokens without a `done` event. */
  | { kind: "incomplete"; receivedTokens: boolean }
  | { kind: "aborted"; receivedTokens: boolean };

export type AttemptOptions = {
  question: string;
  signal: AbortSignal;
  onToken: (value: string) => void;
  fetchImpl?: typeof fetch;
  endpoint?: string;
};

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export function parseRetryAfter(header: string | null, now: number = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/**
 * One POST /api/chat attempt. Framing is delegated to eventsource-parser; this function owns status/content-type
 * checks, UTF-8 decoding, schema validation and classification. It never retries and never throws for expected failures.
 */
export async function runAttempt({ question, signal, onToken, fetchImpl = fetch, endpoint = "/api/chat" }: AttemptOptions): Promise<AttemptResult> {
  let receivedTokens = false;

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
