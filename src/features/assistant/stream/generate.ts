import { runAttempt, type AttemptOptions, type AttemptResult } from "./consume";

export type RetryPolicy = {
  /** Automatic retries after the initial attempt. Only before any token, and only for retryable failures. */
  maxRetries: number;
  baseDelayMs: number;
  firstEventMs: number;
  idleMs: number;
  /** Budget across all attempts and backoff. */
  totalMs: number;
  /** Random extra delay in [0, maxMs). Injectable so tests are deterministic. */
  jitter: (maxMs: number) => number;
};

export const DEFAULT_POLICY: RetryPolicy = {
  maxRetries: 2,
  baseDelayMs: 500,
  firstEventMs: 15_000,
  idleMs: 15_000,
  totalMs: 90_000,
  jitter: (maxMs) => Math.random() * maxMs,
};

export type GenerationOptions = Omit<AttemptOptions, "timeouts"> & {
  policy?: RetryPolicy;
  /** Called when an automatic retry has been scheduled (attempt number starts at 1). */
  onRetrying?: (retry: number, delayMs: number) => void;
};

/** Sleeps for `ms`, resolving false early if `signal` aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Runs a generation with the documented policy: at most `maxRetries` automatic retries, only while nothing has been
 * received and the failure is retryable; exponential backoff plus jitter; Retry-After honoured unless it exceeds the
 * remaining budget (then the failure is returned for a later manual retry); one overall deadline; Stop cancels
 * backoff. After any token the partial answer is final: no automatic replay.
 */
export async function runGeneration(options: GenerationOptions): Promise<AttemptResult> {
  const policy = options.policy ?? DEFAULT_POLICY;
  const { signal: userSignal, onRetrying, ...attemptOptions } = options;
  const started = Date.now();
  const remaining = () => policy.totalMs - (Date.now() - started);

  // One controller for the whole generation: user Stop and the overall deadline both end it.
  const overall = new AbortController();
  let deadlineHit = false;
  const forward = () => overall.abort();
  if (userSignal.aborted) overall.abort();
  else userSignal.addEventListener("abort", forward, { once: true });
  const deadline = setTimeout(() => {
    deadlineHit = true;
    overall.abort();
  }, policy.totalMs);

  try {
    for (let retry = 0; ; retry += 1) {
      const result = await runAttempt({
        ...attemptOptions,
        signal: overall.signal,
        timeouts: { firstEventMs: policy.firstEventMs, idleMs: policy.idleMs },
      });

      if (result.kind === "aborted" && deadlineHit && !userSignal.aborted) {
        return result.receivedTokens
          ? { kind: "incomplete", receivedTokens: true, timedOut: true }
          : { kind: "failed", receivedTokens: false, failure: { code: "timeout", message: "The assistant took too long to answer.", retryable: false } };
      }
      if (result.kind !== "failed" || result.receivedTokens || !result.failure.retryable || retry >= policy.maxRetries) return result;

      const backoff = policy.baseDelayMs * 2 ** retry;
      const delay = result.failure.retryAfterMs ?? backoff + policy.jitter(backoff / 2);
      if (delay >= remaining()) {
        const seconds = Math.ceil((result.failure.retryAfterMs ?? delay) / 1000);
        return { ...result, failure: { ...result.failure, message: `${result.failure.message} Try again in about ${seconds} s.` } };
      }

      onRetrying?.(retry + 1, delay);
      const slept = await sleep(delay, overall.signal);
      if (!slept) {
        if (deadlineHit && !userSignal.aborted) {
          return { kind: "failed", receivedTokens: false, failure: { code: "timeout", message: "The assistant took too long to answer.", retryable: false } };
        }
        return { kind: "aborted", receivedTokens: false };
      }
    }
  } finally {
    clearTimeout(deadline);
    userSignal.removeEventListener("abort", forward);
  }
}
