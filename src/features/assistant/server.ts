// Reference mock streaming endpoint for the Market Operations console assignment.
//
// It fakes an LLM: it matches the incoming question to a fixture and streams the
// answer back token-by-token as Server-Sent Events. No model, no network call,
// fully deterministic. Use it as-is or replace it with your own equivalent; the
// event contract (see CONTRACT.md) is what matters.
//
// Adapted copy of data/starter/reference/chat-route.ts (kept pristine). Changes so far:
// the fixtures import path, `server-only`, the handler lives here with a thin route wrapper, and pickFixture gives
// error/abstain fixtures priority (see the comment there), documented text corrections from
// data/overrides/fixtures.local.json, and the handler validates input and stops cleanly
// when the client aborts. The SSE protocol itself is unchanged.

import "server-only";
import "@/shared/lib/zod-config";
import { z } from "zod";
import fixtures from "@/data/starter/fixtures.json";
import overrides from "@/data/overrides/fixtures.local.json";

type Fixture = {
  id: string;
  keywords?: string[];
  kind: "normal" | "low_confidence" | "abstain" | "error";
  answer: { text: string; citations: unknown[]; confidence: string };
  error?: string;
};

type Override = { id: string; answer: { text: string; citations: unknown[] } };
const overrideById = new Map((overrides.overrides as Override[]).map((o) => [o.id, o]));

/** Applies the documented local correction (docs/data-quality.md) on top of the unchanged starter fixture. */
function withOverride(fixture: Fixture): Fixture {
  const o = overrideById.get(fixture.id);
  return o ? { ...fixture, answer: { ...fixture.answer, text: o.answer.text, citations: o.answer.citations } } : fixture;
}

function pickFixture(question: string): Fixture {
  const q = question.toLowerCase();
  const list = fixtures.fixtures as Fixture[];
  const matches = (f: Fixture) => (f.keywords ?? []).some((k) => q.includes(k));
  // Local matcher override: an explicit error trigger or an unsupported-horizon question must win over a topic
  // keyword, otherwise "Germany next year" would answer about Germany instead of abstaining. Original order is
  // kept inside each group.
  const hit = list.find((f) => f.kind === "error" && matches(f)) ?? list.find((f) => f.kind === "abstain" && matches(f)) ?? list.find(matches);
  return withOverride(hit ?? (fixtures.default as Fixture));
}

const TOKEN_DELAY_MS = 35;
const requestSchema = z.object({ question: z.string().trim().min(1, "question is required").max(500, "question is too long (500 characters max)") });

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request.");

  const fixture = pickFixture(parsed.data.question);
  const encoder = new TextEncoder();
  const send = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}

`);

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;
  // Called on client abort (request.signal) or stream cancel: stop enqueueing and release the pending timer.
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    wake?.();
  };
  const pause = (ms: number) =>
    new Promise<void>((resolve) => {
      wake = resolve;
      timer = setTimeout(resolve, ms);
    });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = () => {
        try {
          controller.close();
        } catch {
          /* already closed by cancel */
        }
      };
      req.signal.addEventListener(
        "abort",
        () => {
          stop();
          close();
        },
        { once: true },
      );
      if (req.signal.aborted) {
        stop();
        close();
        return;
      }

      // Error fixture: emit a single error event and stop.
      if (fixture.kind === "error") {
        controller.enqueue(send({ type: "error", message: fixture.error ?? "Something went wrong." }));
        close();
        return;
      }

      // Stream the answer one whitespace-delimited token at a time.
      const tokens = fixture.answer.text.match(/\S+\s*/g) ?? [];
      for (const value of tokens) {
        if (stopped) return;
        controller.enqueue(send({ type: "token", value }));
        await pause(TOKEN_DELAY_MS); // simulate token latency
      }
      if (stopped) return;

      // Final event carries the metadata the trust surface renders.
      controller.enqueue(
        send({
          type: "done",
          kind: fixture.kind,
          citations: fixture.answer.citations,
          confidence: fixture.answer.confidence,
        }),
      );
      close();
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
