"use client";

import { useId } from "react";
import type { AlertRuleInput, Dataset } from "@/domains/market";
import type { ListedRule, Operation } from "./model/operations";
import { useAlertRules } from "./model/use-alert-rules";
import { AlertForm } from "./ui/alert-form";
import { RuleList } from "./ui/rule-list";

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const describeOp = (op: Operation) => (op.op === "create" ? `save “${op.rule.name}”` : op.op === "toggle" ? `${op.rule.enabled ? "enable" : "disable"} “${op.rule.name}”` : `delete “${op.rule.name}”`);

export function AlertRules({ dataset }: { dataset: Dataset }) {
  const id = useId();
  const { rules, loading, writing, run, retry, dismiss, failure } = useAlertRules();

  const save = (input: AlertRuleInput, onConfirmed: () => void) => run({ op: "create", rule: { ...input, id: newId(), createdAt: new Date().toISOString() } }, { onSuccess: onConfirmed });
  const toggle = (rule: ListedRule) => run({ op: "toggle", rule: { id: rule.id, createdAt: rule.createdAt, name: rule.name, scope: rule.scope, marketIds: rule.marketIds, metric: rule.metric, threshold: rule.threshold, enabled: !rule.enabled } });
  const remove = (rule: ListedRule) => run({ op: "delete", rule: { id: rule.id, createdAt: rule.createdAt, name: rule.name, scope: rule.scope, marketIds: rule.marketIds, metric: rule.metric, threshold: rule.threshold, enabled: rule.enabled } });

  return (
    <section aria-labelledby={`${id}-title`} className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          Alert rules
        </h2>
        <p className="rounded-sm border border-[var(--color-border-strong)] px-2 py-0.5 text-xs font-medium" data-testid="persistence-badge">
          Saved in this browser only
        </p>
      </div>
      <p className="text-xs text-muted">Flag any market whose growth or forecast attainment falls below a threshold. Rules are validated by a mock endpoint and stored in this browser&apos;s local storage; nothing is shared.</p>

      <div aria-live="polite" className="mt-3">
        {failure && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-sm border p-3 text-sm" style={{ borderColor: "var(--color-status-off-track)", background: "var(--color-status-off-track-soft)", color: "var(--color-text)" }}>
            <p>
              <span className="font-semibold">Couldn&apos;t {describeOp(failure.operation)}.</span> {failure.message}{" "}
              {failure.operation.op === "create" ? "Your draft is kept." : "The change was undone."}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={retry} disabled={writing} className="rounded-sm border px-3 py-1 font-medium" style={{ borderColor: "var(--color-status-off-track)" }}>
                Retry
              </button>
              <button type="button" onClick={dismiss} className="rounded-sm border px-3 py-1" style={{ borderColor: "var(--color-border-strong)" }}>
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <AlertForm dataset={dataset} saving={writing} onSave={save} />
        <div>
          <h3 className="mb-2 text-base font-semibold">Saved rules</h3>
          {loading || !rules ? <p className="text-sm text-muted">Loading saved rules…</p> : <RuleList rules={rules} dataset={dataset} busy={writing} onToggle={toggle} onDelete={remove} />}
        </div>
      </div>
    </section>
  );
}
