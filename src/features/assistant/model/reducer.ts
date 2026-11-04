import type { DoneMeta } from "./events";
import type { StreamFailure } from "../stream/consume";

export type AnswerStatus = "connecting" | "streaming" | "complete" | "stopped" | "error" | "incomplete";

export type PriorAttempt = { attemptId: string; text: string; status: "stopped" | "error" | "incomplete" };

export type Message = {
  id: string;
  question: string;
  /** The only attempt allowed to change this message. Events from any other attempt are ignored. */
  attemptId: string;
  status: AnswerStatus;
  text: string;
  /** Present only after a `done` event. Never guessed while streaming or after Stop. */
  meta: DoneMeta | null;
  failure: StreamFailure | null;
  /** Automatic retries already made for the current attempt (before any token). */
  autoRetries: number;
  /** Partial answers of earlier attempts, kept separate and never concatenated with the new one. */
  prior: PriorAttempt[];
};

export type AssistantState = { messages: Message[] };
export const initialState: AssistantState = { messages: [] };

export type Action =
  | { type: "asked"; id: string; question: string; attemptId: string }
  | { type: "retried"; id: string; attemptId: string }
  | { type: "retrying"; id: string; attemptId: string; retry: number }
  | { type: "tokens"; id: string; attemptId: string; text: string }
  | { type: "completed"; id: string; attemptId: string; meta: DoneMeta }
  | { type: "failed"; id: string; attemptId: string; failure: StreamFailure }
  | { type: "stopped"; id: string; attemptId: string }
  | { type: "interrupted"; id: string; attemptId: string }
  /** A conversation read back from this tab's session storage after a reload. Ignored if the user already asked something. */
  | { type: "restored"; messages: Message[] };

export const isActive = (status: AnswerStatus) => status === "connecting" || status === "streaming";

function update(state: AssistantState, id: string, fn: (m: Message) => Message): AssistantState {
  return { messages: state.messages.map((m) => (m.id === id ? fn(m) : m)) };
}

/** Applies `fn` only while the message is still on that attempt and still active (terminal states are final). */
function whileActive(state: AssistantState, id: string, attemptId: string, fn: (m: Message) => Message): AssistantState {
  return update(state, id, (m) => (m.attemptId === attemptId && isActive(m.status) ? fn(m) : m));
}

export function reducer(state: AssistantState, action: Action): AssistantState {
  switch (action.type) {
    case "asked":
      return {
        messages: [
          ...state.messages,
          { id: action.id, question: action.question, attemptId: action.attemptId, status: "connecting", text: "", meta: null, failure: null, autoRetries: 0, prior: [] },
        ],
      };
    case "retried":
      return update(state, action.id, (m) => ({
        ...m,
        attemptId: action.attemptId,
        status: "connecting",
        text: "",
        meta: null,
        failure: null,
        autoRetries: 0,
        prior:
          m.status === "stopped" || m.status === "error" || m.status === "incomplete"
            ? m.text
              ? [...m.prior, { attemptId: m.attemptId, text: m.text, status: m.status }]
              : m.prior
            : m.prior,
      }));
    case "retrying":
      return whileActive(state, action.id, action.attemptId, (m) => (m.status === "connecting" ? { ...m, autoRetries: action.retry } : m));
    case "tokens":
      return whileActive(state, action.id, action.attemptId, (m) => ({ ...m, status: "streaming", text: m.text + action.text }));
    case "completed":
      return whileActive(state, action.id, action.attemptId, (m) => ({ ...m, status: "complete", meta: action.meta }));
    case "failed":
      return whileActive(state, action.id, action.attemptId, (m) => ({ ...m, status: "error", failure: action.failure }));
    case "stopped":
      return whileActive(state, action.id, action.attemptId, (m) => ({ ...m, status: "stopped" }));
    case "restored":
      return state.messages.length === 0 ? { messages: action.messages } : state;
    case "interrupted":
      return whileActive(state, action.id, action.attemptId, (m) => ({ ...m, status: "incomplete" }));
  }
}
