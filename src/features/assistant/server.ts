// Reference mock streaming endpoint for the Market Operations console assignment.
//
// It fakes an LLM: it matches the incoming question to a fixture and streams the
// answer back token-by-token as Server-Sent Events. No model, no network call,
// fully deterministic. Use it as-is or replace it with your own equivalent; the
// event contract (see CONTRACT.md) is what matters.
//
// Adapted copy of data/starter/reference/chat-route.ts (kept pristine). Changes so far:
// the fixtures import path, `server-only`, the handler lives here with a thin route wrapper, and pickFixture gives
// error/abstain fixtures priority (see the comment there).

import "server-only";
import fixtures from "@/data/starter/fixtures.json";

type Fixture = {
  id: string;
  keywords?: string[];
  kind: "normal" | "low_confidence" | "abstain" | "error";
  answer: { text: string; citations: unknown[]; confidence: string };
  error?: string;
};

function pickFixture(question: string): Fixture {
  const q = question.toLowerCase();
  const list = fixtures.fixtures as Fixture[];
  const matches = (f: Fixture) => (f.keywords ?? []).some((k) => q.includes(k));
  // Local matcher override: an explicit error trigger or an unsupported-horizon question must win over a topic
  // keyword, otherwise "Germany next year" would answer about Germany instead of abstaining. Original order is
  // kept inside each group.
  const hit = list.find((f) => f.kind === "error" && matches(f)) ?? list.find((f) => f.kind === "abstain" && matches(f)) ?? list.find(matches);
  return hit ?? (fixtures.default as Fixture);
}

export async function POST(req: Request) {
  const { question = "" } = (await req.json()) as { question?: string };
  const fixture = pickFixture(question);
  const encoder = new TextEncoder();
  const send = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Error fixture: emit a single error event and stop.
      if (fixture.kind === "error") {
        controller.enqueue(send({ type: "error", message: fixture.error ?? "Something went wrong." }));
        controller.close();
        return;
      }

      // Stream the answer one whitespace-delimited token at a time.
      const tokens = fixture.answer.text.match(/\S+\s*/g) ?? [];
      for (const value of tokens) {
        controller.enqueue(send({ type: "token", value }));
        await new Promise((r) => setTimeout(r, 35)); // simulate token latency
      }

      // Final event carries the metadata the trust surface renders.
      controller.enqueue(
        send({
          type: "done",
          kind: fixture.kind,
          citations: fixture.answer.citations,
          confidence: fixture.answer.confidence,
        }),
      );
      controller.close();
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
