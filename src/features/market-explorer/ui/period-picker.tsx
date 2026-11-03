import { useId } from "react";
import { formatPeriod } from "@/shared/lib/format";

export function PeriodPicker({ periods, value, onChange }: { periods: readonly string[]; value: string; onChange: (period: string) => void }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        Period
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-sm border border-[var(--color-border-strong)] bg-surface px-2 py-1 text-sm"
      >
        {[...periods].reverse().map((p) => (
          <option key={p} value={p}>
            {formatPeriod(p)}
          </option>
        ))}
      </select>
    </div>
  );
}
