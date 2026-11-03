/** A drill selection the explorer asks the host to apply. Omitted keys are left to the host's reconciliation rules. */
export type ScopeSelection = { region?: string | null; market?: string | null; product?: string | null };
