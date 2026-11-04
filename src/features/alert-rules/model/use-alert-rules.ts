"use client";

import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { applyOperation, MOCK_LATENCY_MS, type ListedRule, type Operation } from "./operations";
import { ALERT_STORAGE_KEY, alertRepository, RuleMissingError } from "./repository";

export const alertRulesKey = ["alert-rules"] as const;
const mutationKey = ["alert-rules", "write"] as const;

export class AlertWriteError extends Error {}

async function send(operation: Operation): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(operation) });
  } catch {
    throw new AlertWriteError("Could not reach the server.");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new AlertWriteError(body?.error ?? `The server rejected the change (HTTP ${response.status}).`);
  }
}

/**
 * Committed rules from browser storage (Query cache, no refetching) plus one write path with the optimistic pattern:
 * snapshot the cache, apply the change at once, send it to the mock endpoint, then either confirm it into storage or
 * roll the cache back to the snapshot. Writes are serialised by the callers (controls are disabled while one is in
 * flight), so a rollback can never overwrite another pending change. Query's own retry is off: a failed write is
 * reported and retried only on the user's say.
 */
export function useAlertRules() {
  const client = useQueryClient();
  const rules = useQuery<ListedRule[]>({ queryKey: alertRulesKey, queryFn: () => alertRepository.load(), staleTime: Infinity });
  const writing = useIsMutating({ mutationKey }) > 0;
  // `useIsMutating` updates a tick after a click, so a second Enter or click could slip in: guard synchronously as well.
  const inFlight = useRef(false);
  // The per-call success handler (resetting the form) must survive a Retry, which re-sends the failed operation.
  const onConfirmed = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    // Another tab changed the stored rules: show them (unless one of our own writes is in flight).
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ALERT_STORAGE_KEY || inFlight.current) return;
      client.setQueryData<ListedRule[]>(alertRulesKey, alertRepository.load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [client]);

  const mutation = useMutation<void, Error, Operation, { previous: ListedRule[] | undefined }>({
    mutationKey,
    retry: false,
    mutationFn: async (operation) => {
      await send(operation);
      try {
        alertRepository.commit(operation); // confirmed by the server: now it is real
      } catch (error) {
        if (error instanceof RuleMissingError) throw new AlertWriteError(error.message);
        throw new AlertWriteError("The rule was accepted but could not be stored in this browser (storage is unavailable or full).");
      }
    },
    onMutate: async (operation) => {
      await client.cancelQueries({ queryKey: alertRulesKey });
      // The cache can still be empty if the initial load has not finished: seed the snapshot from storage so a rollback has a real state to return to.
      const previous = client.getQueryData<ListedRule[]>(alertRulesKey) ?? alertRepository.load();
      client.setQueryData<ListedRule[]>(alertRulesKey, applyOperation(previous, operation, (rule) => ({ ...rule, pending: true })));
      return { previous };
    },
    onError: (_error, _operation, context) => {
      if (context) client.setQueryData(alertRulesKey, context.previous); // roll back to the snapshot; the form keeps its draft
    },
    onSettled: () => {
      inFlight.current = false;
    },
    onSuccess: (_data, operation) => {
      client.setQueryData<ListedRule[]>(alertRulesKey, (current = []) => {
        if (operation.op === "delete") return current;
        return current.map((rule) => (rule.id === operation.rule.id ? { ...operation.rule } : rule)); // drops `pending`
      });
    },
  });

  return {
    rules: rules.data,
    loading: rules.isPending,
    writing,
    run: (operation: Operation, options?: { onSuccess?: () => void }) => {
      if (inFlight.current) return;
      inFlight.current = true;
      onConfirmed.current = options?.onSuccess;
      mutation.mutate(operation, { onSuccess: () => onConfirmed.current?.() });
    },
    retry: () => {
      if (inFlight.current || !mutation.variables) return;
      inFlight.current = true;
      mutation.mutate(mutation.variables, { onSuccess: () => onConfirmed.current?.() });
    },
    dismiss: () => mutation.reset(),
    status: mutation.isPending ? ("saving" as const) : mutation.isSuccess ? ("saved" as const) : mutation.isError ? ("failed" as const) : ("idle" as const),
    lastOperation: mutation.variables,
    failure: mutation.isError && mutation.variables ? { message: mutation.error.message, operation: mutation.variables } : null,
    latencyMs: MOCK_LATENCY_MS,
  };
}
