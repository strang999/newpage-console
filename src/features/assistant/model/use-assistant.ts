"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { track } from "@/shared/observability";
import type { AttemptResult } from "../stream/consume";
import { runGeneration } from "../stream/generate";
import type { ViewContext } from "./context";
import { loadConversation, maxIdNumber, saveConversation } from "./persistence";
import { tokenize } from "./tokens";
import { initialState, isActive, reducer, type AssistantState } from "./reducer";

type Run = { id: string; attemptId: string; controller: AbortController };

/**
 * Owns the lifecycle of assistant requests. One generation at a time. Token updates are batched per animation
 * frame so the dashboard is never re-rendered per token, and every event is tagged with its attempt id.
 */
export function useAssistant(): {
  state: AssistantState;
  busy: boolean;
  ask: (question: string, context?: ViewContext) => void;
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
    async (run: Run, question: string, resumeFrom = 0, context?: ViewContext) => {
      current.current = run;
      pending.current = { text: "", frame: 0 };
      const startedAt = performance.now();
      let firstTokenAt: number | null = null;
      let retries = 0;
      let result: AttemptResult;
      try {
        result = await runGeneration({
          question,
          resumeFrom,
          context,
          signal: run.controller.signal,
          onRetrying: (retry) => {
            retries = retry;
            dispatch({ type: "retrying", id: run.id, attemptId: run.attemptId, retry });
          },
          onToken: (value) => {
            firstTokenAt ??= performance.now();
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
      // Operational facts only: timings, retry count, how it ended and a classified code. No question, answer or citation text.
      track("assistant_stream", {
        attemptId: run.attemptId,
        durationMs: performance.now() - startedAt,
        ttftMs: firstTokenAt === null ? undefined : firstTokenAt - startedAt,
        retryCount: retries,
        terminalState: result.kind === "done" ? "complete" : result.kind === "failed" ? "error" : result.kind === "aborted" ? "stopped" : "incomplete",
        errorCode: result.kind === "failed" ? result.failure.code : undefined,
      });
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
    (question: string, context?: ViewContext) => {
      const text = question.trim();
      if (!text || current.current) return;
      const run: Run = { id: nextId("m"), attemptId: nextId("a"), controller: new AbortController() };
      dispatch({ type: "asked", id: run.id, question: text, attemptId: run.attemptId, context });
      void start(run, text, 0, context);
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
      void start(run, message.question, 0, message.context);
    },
    [start],
  );

  const stop = useCallback(() => {
    current.current?.controller.abort();
  }, []);

  // Restore this tab's conversation after a reload (in an effect: the server render and first client render are empty).
  const restored = useRef(false);
  useEffect(() => {
    const { messages, resume } = loadConversation();
    if (messages.length) {
      counter.current = Math.max(counter.current, maxIdNumber(messages));
      dispatch({ type: "restored", messages });
      // An answer that was streaming when the page went away continues where it stopped (the mock endpoint skips the
      // tokens already received). Anything else interrupted stays "interrupted" with a manual Retry.
      if (resume && !current.current) {
        const run: Run = { id: resume.id, attemptId: nextId("a"), controller: new AbortController() };
        dispatch({ type: "resumed", id: run.id, attemptId: run.attemptId });
        void start(run, resume.question, tokenize(resume.text).length, resume.context);
      }
    }
    restored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount; start and nextId are stable
  }, []);

  // Keep the stored copy current: trailing write while tokens stream, immediate write when the page is being hidden.
  const latest = useRef(state.messages);
  useEffect(() => {
    latest.current = state.messages;
    if (!restored.current || state.messages.length === 0) return;
    const timer = setTimeout(() => saveConversation(latest.current), 250);
    return () => clearTimeout(timer);
  }, [state.messages]);
  useEffect(() => {
    const flushNow = () => {
      if (restored.current && latest.current.length) saveConversation(latest.current);
    };
    window.addEventListener("pagehide", flushNow);
    return () => window.removeEventListener("pagehide", flushNow);
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
