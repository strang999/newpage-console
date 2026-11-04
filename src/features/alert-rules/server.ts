import "server-only";
import raw from "@/data/starter/data.json";
import { datasetSchema, unknownMarketIds } from "@/domains/market";
import { FAILURE_TRIGGER, MOCK_LATENCY_MS, operationSchema } from "./model/operations";

const dataset = datasetSchema.parse(raw);

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Mock validation endpoint for alert rules. It stores nothing (a process-global array would not survive a serverless
 * deployment): it validates the operation, simulates latency, and either echoes the rule or fails deterministically
 * when the rule name contains "fail".
 */
export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }
  const parsed = operationSchema.safeParse(payload);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid alert rule." }, 400);

  const { rule, op } = parsed.data;
  const unknown = unknownMarketIds(dataset, rule.marketIds);
  if (unknown.length > 0) return json({ error: `Unknown market: ${unknown.join(", ")}` }, 400);

  await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
  if (req.signal.aborted) return json({ error: "Request cancelled." }, 499);

  if (FAILURE_TRIGGER.test(rule.name)) {
    return json({ error: "The server could not save this rule (simulated failure)." }, 500);
  }
  return json({ ok: true, op, rule }, 200);
}
