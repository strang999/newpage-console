import type { MapScale } from "@/domains/market";
import { classColor } from "../colors";
import { mapPatterns } from "./patterns";

const legendPatterns = mapPatterns("legend");

/** Numeric stops, not just colours: every swatch is labelled with its range, and status swatches carry the same texture as the map. */
export function Legend({ scale }: { scale: MapScale }) {
  return (
    <div>
      {/* One definition block for the swatches, so pattern ids are unique in the document. */}
      <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute">
        {legendPatterns.defs}
      </svg>
      <p className="text-xs font-semibold">{scale.title}</p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {scale.classes.map((c, i) => (
          <li key={c.label} className="flex items-center gap-1.5 text-xs">
            <svg width="22" height="12" aria-hidden="true" className="rounded-sm border border-[var(--color-text-muted)]">
              <rect width="22" height="12" fill={scale.kind === "categorical" ? legendPatterns.categorical(i) : classColor(scale, i)} />
            </svg>
            {c.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5 text-xs">
          <svg width="22" height="12" aria-hidden="true" className="rounded-sm border border-[var(--color-text-muted)]">
            <rect width="22" height="12" fill={legendPatterns.noData} />
          </svg>
          No data
        </li>
      </ul>
    </div>
  );
}
