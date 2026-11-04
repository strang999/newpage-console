"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { useForm, useWatch } from "react-hook-form";
import { alertRuleInputSchema, evaluateRule, formatPeriodLabel, THRESHOLD_BOUNDS, type AlertRuleInput, type Dataset } from "@/domains/market";
import { formatPercent } from "@/shared/lib/format";

const DEFAULTS: Partial<AlertRuleInput> = { name: "", scope: "all", marketIds: [], metric: "attainment", enabled: true };

/** Whether what is in the form now is still exactly what was submitted (so a confirmed save may clear it). */
function sameDraft(now: Partial<AlertRuleInput>, submitted: AlertRuleInput): boolean {
  const ids = (list: readonly string[] | undefined) => [...(list ?? [])].sort().join(",");
  return (
    (now.name ?? "").trim() === submitted.name.trim() &&
    now.scope === submitted.scope &&
    now.metric === submitted.metric &&
    now.threshold === submitted.threshold &&
    now.enabled === submitted.enabled &&
    (submitted.scope === "all" || ids(now.marketIds) === ids(submitted.marketIds))
  );
}

const inputClass = "rounded-sm border bg-surface px-2 py-1.5 text-sm aria-[invalid=true]:border-[var(--color-status-off-track)]";
const inputStyle = { borderColor: "var(--color-border-strong)" } as const;

function Error({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="mt-1 flex items-center gap-1 text-xs font-medium" style={{ color: "var(--color-status-off-track)" }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
      {message}
    </p>
  ) : null;
}

/**
 * The alert-rule form. Validation is the shared domain schema; an empty threshold is an error (never 0); the affected
 * markets for the latest period are previewed live. It never resets itself: the parent resets it only after a confirmed save,
 * so a rejected save keeps every keystroke.
 */
export function AlertForm({ dataset, saving, onSave }: { dataset: Dataset; saving: boolean; onSave: (rule: AlertRuleInput, onConfirmed: () => void) => void }) {
  const id = useId();
  const form = useForm<AlertRuleInput>({ resolver: zodResolver(alertRuleInputSchema), defaultValues: DEFAULTS, mode: "onTouched" });
  const { register, handleSubmit, formState, control, reset, getValues, trigger, getFieldState } = form;
  const errors = formState.errors;

  // The bounds depend on the metric. With onTouched validation a radio change would not re-validate the threshold, so a stale
  // bounds error could linger (or a newly invalid value go unflagged): re-check it whenever it has a value or an error.
  const revalidateThreshold = () => {
    if (Number.isFinite(getValues("threshold")) || getFieldState("threshold").error) void trigger("threshold");
  };

  const values = useWatch({ control });
  const scope = values.scope ?? "all";
  const metric = values.metric ?? "attainment";
  const latest = dataset.meta.latestPeriod;
  const candidate = alertRuleInputSchema.safeParse(values);
  const preview = candidate.success ? evaluateRule(dataset, candidate.data, latest) : null;
  const flagged = preview?.filter((p) => p.flagged) ?? [];
  const bounds = THRESHOLD_BOUNDS[metric];

  const submit = handleSubmit((input) => {
    if (saving) return;
    // Clear the form only if the user has not started a different draft while the save was in flight.
    onSave({ ...input, name: input.name.trim(), marketIds: input.scope === "all" ? [] : input.marketIds }, () => {
      if (sameDraft(getValues(), input)) reset(DEFAULTS);
    });
  });

  return (
    <form onSubmit={(e) => (saving ? e.preventDefault() : void submit(e))} noValidate aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
      <h3 id={`${id}-title`} className="text-base font-semibold">
        New alert rule
      </h3>

      <div className="flex flex-col">
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          Name
        </label>
        <input
          id={`${id}-name`}
          type="text"
          autoComplete="off"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${id}-name-error` : `${id}-name-hint`}
          className={`mt-1 ${inputClass}`}
          style={inputStyle}
          {...register("name")}
        />
        <p id={`${id}-name-hint`} className="mt-1 text-xs text-muted">
          2 to 60 characters. To see a failed save roll back, include the word &quot;fail&quot; in the name.
        </p>
        <Error id={`${id}-name-error`} message={errors.name?.message} />
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Applies to</legend>
        <div className="mt-1 flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" value="all" {...register("scope")} /> All markets
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" value="selected" {...register("scope")} /> Selected markets
          </label>
        </div>
        {scope === "selected" && (
          <div className="mt-2" role="group" aria-label="Markets" aria-describedby={errors.marketIds ? `${id}-markets-error` : undefined}>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {dataset.markets.map((m) => (
                <li key={m.id}>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" value={m.id} {...register("marketIds")} /> {m.name}
                  </label>
                </li>
              ))}
            </ul>
            <Error id={`${id}-markets-error`} message={errors.marketIds?.message} />
          </div>
        )}
      </fieldset>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <fieldset>
          <legend className="text-sm font-medium">Metric</legend>
          <div className="mt-1 flex gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" value="attainment" {...register("metric", { onChange: revalidateThreshold })} /> Forecast attainment
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" value="growth" {...register("metric", { onChange: revalidateThreshold })} /> YoY growth
            </label>
          </div>
        </fieldset>

        <div className="flex flex-col">
          <label htmlFor={`${id}-threshold`} className="text-sm font-medium">
            Alert when below (%)
          </label>
          <input
            id={`${id}-threshold`}
            type="number"
            step="0.1"
            inputMode="decimal"
            aria-invalid={errors.threshold ? true : undefined}
            aria-describedby={errors.threshold ? `${id}-threshold-error` : `${id}-threshold-hint`}
            className={`mt-1 w-32 ${inputClass}`}
            style={inputStyle}
            {...register("threshold", { valueAsNumber: true })}
          />
          <p id={`${id}-threshold-hint`} className="mt-1 text-xs text-muted">
            {bounds.min}% to {bounds.max}%
          </p>
          <Error id={`${id}-threshold-error`} message={errors.threshold?.message} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register("enabled")} /> Enabled
      </label>

      <section aria-labelledby={`${id}-preview`} className="rounded-sm bg-[var(--color-surface-sunken)] p-3 text-sm" data-testid="alert-preview">
        <h4 id={`${id}-preview`} className="font-medium">
          Preview for {formatPeriodLabel(latest)}
        </h4>
        {preview === null ? (
          <p className="text-muted">Complete the rule to see which markets it would flag.</p>
        ) : flagged.length === 0 ? (
          <p>No market is currently below the threshold ({preview.length} checked).</p>
        ) : (
          <>
            <p>
              Would flag {flagged.length} of {preview.length} {preview.length === 1 ? "market" : "markets"}:
            </p>
            <ul className="mt-1 list-disc pl-5">
              {flagged.map((p) => (
                <li key={p.row.market.id}>
                  {p.row.market.name}: {formatPercent(p.value, { signed: metric === "growth" })}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          aria-disabled={saving}
          className="rounded-sm px-4 py-2 text-sm font-semibold aria-disabled:opacity-60"
          style={{ background: "var(--color-accent)", color: "var(--color-accent-contrast)" }}
        >
          {saving ? "Saving…" : "Save rule"}
        </button>
        {formState.submitCount > 0 && !formState.isValid && Object.keys(errors).length > 0 && <p className="text-xs text-muted">Fix the highlighted fields to save.</p>}
      </div>
    </form>
  );
}
