import { sanitizeIncoming } from "@/shared/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 2_048;

/**
 * No-op telemetry sink. It re-applies the allowlist to whatever arrives, then drops the event: this is where a real
 * RUM vendor or log pipeline would plug in. It stores nothing and returns 204 either way, so a client never retries.
 */
export async function POST(req: Request) {
  const declared = Number(req.headers.get("content-length") ?? 0);
  // Do not buffer a body that says it is too large; a client that lies is still capped by the length check below.
  const text = declared > MAX_BYTES ? "" : await req.text().catch(() => "");
  if (text.length > 0 && text.length <= MAX_BYTES) {
    try {
      const event = sanitizeIncoming(JSON.parse(text));
      if (event && process.env.TELEMETRY_LOG === "1") console.info("[telemetry]", JSON.stringify(event));
    } catch {
      /* malformed events are dropped */
    }
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
