/**
 * Telemetry is built from an allowlist. Anything not named here (questions, answers, citations, form drafts, URLs,
 * headers, error messages, stack traces) cannot enter an event, whatever a caller passes in. Strings must also look
 * like codes, so free text cannot be smuggled through an allowed key.
 */
export const ALLOWED_KEYS = ["event", "attemptId", "durationMs", "ttftMs", "retryCount", "terminalState", "errorCode", "surface", "metric", "value", "rating", "navigationType"] as const;
export type AllowedKey = (typeof ALLOWED_KEYS)[number];

export const EVENT_NAMES = ["assistant_stream", "web_vital", "render_error"] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export type TelemetryEvent = { event: EventName } & Partial<Record<Exclude<AllowedKey, "event">, string | number>>;

const CODE = /^[A-Za-z0-9_.:-]{1,40}$/;

function cleanValue(value: unknown): string | number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : undefined;
  if (typeof value === "string") return CODE.test(value) ? value : undefined;
  return undefined;
}

/** Returns the event with only allowlisted keys and code-shaped values, or null if the name is not a known event. */
export function buildEvent(name: unknown, fields: Readonly<Record<string, unknown>> = {}): TelemetryEvent | null {
  if (typeof name !== "string" || !(EVENT_NAMES as readonly string[]).includes(name)) return null;
  const event: TelemetryEvent = { event: name as EventName };
  for (const key of ALLOWED_KEYS) {
    if (key === "event") continue;
    const value = cleanValue(fields[key]);
    if (value !== undefined) (event as Record<string, string | number>)[key] = value;
  }
  return event;
}

/** Re-validates an event that arrived over the network (the /api/telemetry sink), with the same allowlist. */
export function sanitizeIncoming(payload: unknown): TelemetryEvent | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  return buildEvent(record.event, record);
}
