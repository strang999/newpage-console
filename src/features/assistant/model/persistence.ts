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
  /** Still running when the page went away: the one message that may be resumed on the next load. */
  interrupted: z.boolean().optional(),
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

const isActive = (m: Message) => m.status === "connecting" || m.status === "streaming";

export function saveConversation(messages: Message[]): void {
  try {
    const stored = messages.slice(-MAX_MESSAGES).map((m) => ({ ...settle(m), ...(isActive(m) ? { interrupted: true } : {}) }));
    sessionStorage.setItem(KEY, JSON.stringify({ v: 1, messages: stored }));
  } catch {
    /* storage blocked or full: the conversation just will not survive a reload */
  }
}

/** `resume` is the message that was streaming when the page went away, if any: the caller may continue it. */
export function loadConversation(): { messages: Message[]; resume: Message | null } {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return { messages: [], resume: null };
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { messages: [], resume: null };
    const messages = parsed.data.messages.map((stored) => {
      const message = { ...stored };
      delete message.interrupted;
      return settle(message);
    });
    const flagged = parsed.data.messages.findLast((m) => m.interrupted);
    return { messages, resume: messages.find((m) => m.id === flagged?.id) ?? null };
  } catch {
    return { messages: [], resume: null };
  }
}

/** Highest numeric suffix among stored ids, so new ids never collide with restored ones. */
export function maxIdNumber(messages: Message[]): number {
  let max = 0;
  for (const m of messages) for (const id of [m.id, m.attemptId, ...m.prior.map((p) => p.attemptId)]) max = Math.max(max, Number(id.replace(/\D/g, "")) || 0);
  return max;
}
