import { classColor } from "../colors";

/**
 * SVG fills for the map and its legend. Categorical status gets a distinct texture per class (dots, stripes,
 * cross-hatch) so it is readable without colour; "no data" is a neutral hatch. Ids carry a suffix so the map and the
 * legend never share an id.
 */
export function mapPatterns(suffix: string) {
  const id = (name: string) => `market-map-${name}-${suffix}`;
  return {
    noData: `url(#${id("no-data")})`,
    categorical: (index: number) => `url(#${id(`cat-${index}`)})`,
    defs: (
      <defs>
        <pattern id={id("no-data")} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--scale-nodata)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-border-strong)" strokeWidth="1" />
        </pattern>
        {/* on track: solid with white dots */}
        <pattern id={id("cat-0")} width="7" height="7" patternUnits="userSpaceOnUse">
          <rect width="7" height="7" fill={classColor({ kind: "categorical" }, 0)} />
          <circle cx="3.5" cy="3.5" r="1.3" fill="#fff" />
        </pattern>
        {/* at risk: diagonal stripes */}
        <pattern id={id("cat-1")} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="7" fill={classColor({ kind: "categorical" }, 1)} />
          <rect width="2.6" height="7" fill="var(--color-text)" opacity="0.85" />
        </pattern>
        {/* off track: cross-hatch */}
        <pattern id={id("cat-2")} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill={classColor({ kind: "categorical" }, 2)} />
          <path d="M0 0H6M0 0V6" stroke="#fff" strokeWidth="1.4" />
        </pattern>
      </defs>
    ),
  };
}
