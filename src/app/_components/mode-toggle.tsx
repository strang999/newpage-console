"use client";

import { useId } from "react";
import type { Mode } from "@/domains/market";

const OPTIONS: { id: Mode; label: string; hint: string }[] = [
  { id: "executive", label: "Executive", hint: "Health, trend, top risks and movers" },
  { id: "analyst", label: "Analyst", hint: "Every metric, dense tables, comparison and heatmap" },
];

/** Audience switch. The mode is URL state, so a shared link carries the audience with it. */
export function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="sr-only">Audience</legend>
      <div className="inline-flex rounded-full border border-[var(--color-border-strong)] bg-surface p-0.5">
        {OPTIONS.map((o) => (
          <label key={o.id} className="cursor-pointer" title={o.hint}>
            <input type="radio" name={`${name}-mode`} value={o.id} checked={mode === o.id} onChange={() => onChange(o.id)} className="peer sr-only" />
            <span className="inline-block rounded-full px-3.5 py-1 text-sm font-medium peer-checked:bg-[var(--color-accent)] peer-checked:text-[var(--color-accent-contrast)] peer-focus-visible:shadow-[var(--focus-ring)]">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
