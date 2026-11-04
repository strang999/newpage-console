import { evaluateRule, formatPeriodLabel, type Dataset } from "@/domains/market";
import { formatPercent } from "@/shared/lib/format";
import type { ListedRule } from "../model/operations";

function describe(rule: ListedRule, dataset: Dataset) {
  const scope = rule.scope === "all" ? `all ${dataset.markets.length} markets` : rule.marketIds.map((id) => dataset.markets.find((m) => m.id === id)?.name ?? id).join(", ");
  const metric = rule.metric === "growth" ? "YoY growth" : "Forecast attainment";
  return { scope, condition: `${metric} below ${formatPercent(rule.threshold)}` };
}

export function RuleList({
  rules,
  dataset,
  busy,
  onToggle,
  onDelete,
}: {
  rules: readonly ListedRule[];
  dataset: Dataset;
  busy: boolean;
  onToggle: (rule: ListedRule) => void;
  onDelete: (rule: ListedRule) => void;
}) {
  if (rules.length === 0) {
    return <p className="rounded-sm border border-dashed border-[var(--color-border-strong)] p-3 text-sm text-muted">No rules yet. Create one with the form; rules are saved in this browser only.</p>;
  }
  const latest = dataset.meta.latestPeriod;
  return (
    <ul className="flex flex-col divide-y divide-[var(--color-border)] rounded-sm border border-border">
      {rules.map((rule) => {
        const { scope, condition } = describe(rule, dataset);
        const hits = rule.enabled ? evaluateRule(dataset, rule, latest).filter((e) => e.flagged) : [];
        return (
          <li key={rule.id} className="flex flex-wrap items-start justify-between gap-3 p-3" data-testid="alert-rule" data-pending={rule.pending ? "true" : undefined}>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {rule.name}
                {rule.pending && (
                  <span className="rounded-sm px-1.5 py-0.5 text-xs font-medium" style={{ background: "var(--color-status-at-risk-soft)", color: "var(--color-status-at-risk)" }}>
                    Saving…
                  </span>
                )}
                {!rule.enabled && <span className="rounded-sm bg-[var(--color-surface-sunken)] px-1.5 py-0.5 text-xs text-muted">Disabled</span>}
              </p>
              <p className="text-sm text-muted">
                {condition} · {scope}
              </p>
              {rule.enabled && (
                <p className="text-xs text-muted">
                  {hits.length === 0 ? `Flags no market in ${formatPeriodLabel(latest)}` : `Flags ${hits.length} in ${formatPeriodLabel(latest)}: ${hits.map((h) => h.row.market.name).join(", ")}`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={rule.enabled}
                aria-label={`${rule.name}: enabled`}
                disabled={busy}
                onClick={() => onToggle(rule)}
                className="relative h-6 w-11 rounded-full border transition-colors disabled:opacity-50"
                style={{ borderColor: "var(--color-border-strong)", background: rule.enabled ? "var(--color-accent)" : "var(--color-surface-sunken)" }}
              >
                <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-all ${rule.enabled ? "left-[22px]" : "left-0.5"}`} style={{ height: 18, width: 18 }} />
              </button>
              <button type="button" disabled={busy} onClick={() => onDelete(rule)} aria-label={`Delete ${rule.name}`} className="rounded-sm border px-2.5 py-1 text-sm disabled:opacity-50" style={{ borderColor: "var(--color-border-strong)" }}>
                Delete
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
