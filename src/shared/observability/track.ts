import { buildEvent, type TelemetryEvent } from "./events";

export type TelemetrySink = (event: TelemetryEvent) => void;

/** Development: console only. Production: a beacon to the no-op sink route. Nothing leaves the app to a third party. */
function defaultSink(event: TelemetryEvent) {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") {
    console.debug("[telemetry]", event);
    return;
  }
  try {
    const body = new Blob([JSON.stringify(event)], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/telemetry", body)) void fetch("/api/telemetry", { method: "POST", body, keepalive: true }).catch(() => undefined);
  } catch {
    /* telemetry must never break the app */
  }
}

let sink: TelemetrySink = defaultSink;

/** Swap the sink (tests, or a real RUM vendor adapter). Returns a function that restores the previous one. */
export function setTelemetrySink(next: TelemetrySink): () => void {
  const previous = sink;
  sink = next;
  return () => {
    sink = previous;
  };
}

/** Build an allowlisted event and hand it to the sink. Never throws. */
export function track(name: Parameters<typeof buildEvent>[0], fields?: Parameters<typeof buildEvent>[1]) {
  try {
    const event = buildEvent(name, fields);
    if (event) sink(event);
  } catch {
    /* ignore */
  }
}
