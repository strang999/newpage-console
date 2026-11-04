"use client";

import { useId } from "react";

/**
 * Switch for the simulated live feed. The state text is always visible (not just colour), and the only thing announced is
 * the switch itself, never each update.
 */
export function LiveToggle({ on, onChange, updatedAt }: { on: boolean; onChange: (on: boolean) => void; updatedAt: Date | null }) {
  const id = useId();
  return (
    <div className="inline-flex items-center gap-2 text-sm">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={`${id}-note`}
        onClick={() => onChange(!on)}
        className="inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 font-medium"
        style={{ borderColor: on ? "var(--color-accent)" : "var(--color-border-strong)" }}
      >
        <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${on ? "bg-[var(--color-status-on-track)]" : "bg-[var(--color-border-strong)]"}`} />
        Live: {on ? "on" : "off"}
      </button>
      <span id={`${id}-note`} className="text-xs text-muted" data-testid="live-note">
        {on
          ? `Simulated feed${updatedAt ? ` · updated ${updatedAt.toLocaleTimeString("en-GB")}` : ""}. The assistant and its evidence keep using the supplied data.`
          : "Simulated updates to the latest month."}
      </span>
    </div>
  );
}
