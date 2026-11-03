// Reference mock streaming endpoint for the Market Operations console assignment.
//
// It fakes an LLM: it matches the incoming question to a fixture and streams the
// answer back token-by-token as Server-Sent Events. No model, no network call,
// fully deterministic. Use it as-is or replace it with your own equivalent; the
// event contract (see CONTRACT.md) is what matters.
//
// Place this at: app/api/chat/route.ts
// Adjust the import below to wherever you put fixtures.json.

import fixtures from "@/data/fixtures.json";

export const runtime = "nodejs";

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
  const hit = list.find((f) => (f.keywords ?? []).some((k) => q.includes(k)));
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
