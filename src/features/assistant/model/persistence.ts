import "@/shared/lib/zod-config";
import { z } from "zod";
import { doneMetaSchema } from "./events";
import type { Message } from "./reducer";

const KEY = "assistant:conversation:v1";
const MAX_MESSAGES = 50;

const failureSchema = z.object({
  code: z.enum(["network", "timeout", "http", "content_type", "no_body", "protocol", "server_error"]),
  message: z.string(),
  retryable: z.boolean(),
  status: z.number().optional(),
  retryAfterMs: z.number().optional(),
});

const messageSchema = z.object({
  id: z.string(),
  question: z.string(),
  attemptId: z.string(),
  status: z.enum(["connecting", "streaming", "complete", "stopped", "error", "incomplete"]),
  text: z.string(),
  meta: doneMetaSchema.nullable(),
  failure: failureSchema.nullable(),
  autoRetries: z.number(),
  prior: z.array(z.object({ attemptId: z.string(), text: z.string(), status: z.enum(["stopped", "error", "incomplete"]) })),
});
const storedSchema = z.object({ v: z.literal(1), messages: z.array(messageSchema) });

/**
 * A request that was still running when the tab closed or reloaded cannot be resumed (the contract has no cursor to
 * resume from), so it is stored as an interrupted answer: the partial text stays, confidence and citations stay
 * unavailable, and Retry starts a new attempt.
 */
function settle(message: Message): Message {
  return message.status === "connecting" || message.status === "streaming" ? { ...message, status: "incomplete", meta: null, failure: null } : message;
}

export function saveConversation(messages: Message[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ v: 1, messages: messages.slice(-MAX_MESSAGES).map(settle) }));
  } catch {
    /* storage blocked or full: the conversation just will not survive a reload */
  }
}

export function loadConversation(): Message[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.messages.map(settle) : [];
  } catch {
    return [];
  }
}

/** Highest numeric suffix among stored ids, so new ids never collide with restored ones. */
export function maxIdNumber(messages: Message[]): number {
  let max = 0;
  for (const m of messages) for (const id of [m.id, m.attemptId, ...m.prior.map((p) => p.attemptId)]) max = Math.max(max, Number(id.replace(/\D/g, "")) || 0);
  return max;
}
