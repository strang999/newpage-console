import type { MapScale } from "@/domains/market";
import { classColor, NO_DATA_PATTERN_ID } from "../colors";

/** Numeric stops, not just colours: every swatch is labelled with its range. */
export function Legend({ scale }: { scale: MapScale }) {
  return (
    <div>
      <p className="text-xs font-semibold">{scale.title}</p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {scale.classes.map((c, i) => (
          <li key={c.label} className="flex items-center gap-1.5 text-xs">
            <span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm border border-[var(--color-border-strong)]" style={{ background: classColor(scale, i) }} />
            {c.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5 text-xs">
          <svg width="20" height="12" aria-hidden="true" className="rounded-sm border border-[var(--color-border-strong)]">
            <defs>
              <pattern id={`${NO_DATA_PATTERN_ID}-legend`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="var(--scale-nodata)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-border-strong)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="20" height="12" fill={`url(#${NO_DATA_PATTERN_ID}-legend)`} />
          </svg>
          No data
        </li>
      </ul>
    </div>
  );
}
