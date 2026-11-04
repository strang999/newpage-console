"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { AttemptResult } from "../stream/consume";
import { runGeneration } from "../stream/generate";
import { initialState, isActive, reducer, type AssistantState } from "./reducer";

type Run = { id: string; attemptId: string; controller: AbortController };

/**
 * Owns the lifecycle of assistant requests. One generation at a time. Token updates are batched per animation
 * frame so the dashboard is never re-rendered per token, and every event is tagged with its attempt id.
 */
export function useAssistant(): {
  state: AssistantState;
  busy: boolean;
  ask: (question: string) => void;
  stop: () => void;
  retry: (messageId: string) => void;
} {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const current = useRef<Run | null>(null);
  const counter = useRef(0);
  const pending = useRef({ text: "", frame: 0 });
  const unmounted = useRef(false);

  const flush = useCallback((run: Run) => {
    const p = pending.current;
    if (p.frame) cancelAnimationFrame(p.frame);
    p.frame = 0;
    if (p.text) {
      dispatch({ type: "tokens", id: run.id, attemptId: run.attemptId, text: p.text });
      p.text = "";
    }
  }, []);

  const start = useCallback(
    async (run: Run, question: string) => {
      current.current = run;
      pending.current = { text: "", frame: 0 };
      let result: AttemptResult;
      try {
        result = await runGeneration({
          question,
          signal: run.controller.signal,
          onRetrying: (retry) => dispatch({ type: "retrying", id: run.id, attemptId: run.attemptId, retry }),
          onToken: (value) => {
            pending.current.text += value;
            if (!pending.current.frame) {
              pending.current.frame = requestAnimationFrame(() => {
                pending.current.frame = 0;
                flush(run);
              });
            }
          },
        });
      } catch {
        result = { kind: "failed", receivedTokens: false, failure: { code: "network", message: "Something went wrong.", retryable: true } };
      }
      if (unmounted.current || current.current !== run) return;
      flush(run);
      current.current = null;
      const base = { id: run.id, attemptId: run.attemptId };
      switch (result.kind) {
        case "done":
          dispatch({ type: "completed", ...base, meta: result.meta });
          break;
        case "failed":
          dispatch({ type: "failed", ...base, failure: result.failure });
          break;
        case "incomplete":
          dispatch({ type: "interrupted", ...base });
          break;
        case "aborted":
          dispatch({ type: "stopped", ...base });
          break;
      }
    },
    [flush],
  );

  const nextId = (prefix: string) => `${prefix}${++counter.current}`;

  const ask = useCallback(
    (question: string) => {
      const text = question.trim();
      if (!text || current.current) return;
      const run: Run = { id: nextId("m"), attemptId: nextId("a"), controller: new AbortController() };
      dispatch({ type: "asked", id: run.id, question: text, attemptId: run.attemptId });
      void start(run, text);
    },
    [start],
  );

  const retry = useCallback(
    (messageId: string) => {
      if (current.current) return;
      const message = stateRef.current.messages.find((m) => m.id === messageId);
      if (!message || isActive(message.status) || message.status === "complete") return;
      const run: Run = { id: messageId, attemptId: nextId("a"), controller: new AbortController() };
      dispatch({ type: "retried", id: messageId, attemptId: run.attemptId });
      void start(run, message.question);
    },
    [start],
  );

  const stop = useCallback(() => {
    current.current?.controller.abort();
  }, []);

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      const run = current.current;
      current.current = null;
      if (pending.current.frame) cancelAnimationFrame(pending.current.frame);
      run?.controller.abort();
    };
  }, []);

  return { state, busy: state.messages.some((m) => isActive(m.status)), ask, stop, retry };
}
