"use client";

import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { applyOperation, MOCK_LATENCY_MS, type ListedRule, type Operation } from "./operations";
import { alertRepository } from "./repository";

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

  const mutation = useMutation<void, Error, Operation, { previous: ListedRule[] | undefined }>({
    mutationKey,
    retry: false,
    mutationFn: async (operation) => {
      await send(operation);
      try {
        alertRepository.commit(operation); // confirmed by the server: now it is real
      } catch {
        throw new AlertWriteError("The rule was accepted but could not be stored in this browser (storage is unavailable or full).");
      }
    },
    onMutate: async (operation) => {
      await client.cancelQueries({ queryKey: alertRulesKey });
      const previous = client.getQueryData<ListedRule[]>(alertRulesKey);
      client.setQueryData<ListedRule[]>(alertRulesKey, (current = []) => applyOperation(current, operation, (rule) => ({ ...rule, pending: true })));
      return { previous };
    },
    onError: (_error, _operation, context) => {
      client.setQueryData(alertRulesKey, context?.previous); // roll back to the snapshot; the form keeps its draft
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
    run: (operation: Operation, options?: { onSuccess?: () => void }) => mutation.mutate(operation, { onSuccess: options?.onSuccess }),
    retry: () => mutation.variables && mutation.mutate(mutation.variables),
    dismiss: () => mutation.reset(),
    failure: mutation.isError && mutation.variables ? { message: mutation.error.message, operation: mutation.variables } : null,
    latencyMs: MOCK_LATENCY_MS,
  };
}
