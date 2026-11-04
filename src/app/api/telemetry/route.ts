import { sanitizeIncoming } from "@/shared/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 2_048;

/**
 * No-op telemetry sink. It re-applies the allowlist to whatever arrives, then drops the event: this is where a real
 * RUM vendor or log pipeline would plug in. It stores nothing and returns 204 either way, so a client never retries.
 */
export async function POST(req: Request) {
  const text = await req.text().catch(() => "");
  if (text.length <= MAX_BYTES) {
    try {
      const event = sanitizeIncoming(JSON.parse(text));
      if (event && process.env.TELEMETRY_LOG === "1") console.info("[telemetry]", JSON.stringify(event));
    } catch {
      /* malformed events are dropped */
    }
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
