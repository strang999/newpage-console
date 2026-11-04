"use client";

import type { GeoJsonObject } from "geojson";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { numericIdForIso3, type MapScale, type MarketRow } from "@/domains/market";
import topology from "../data/countries-110m.json";
import { classColor, NO_DATA_PATTERN_ID } from "../colors";

export type Readout = { name: string; row: MarketRow | null };

const ANTARCTICA = "010";

/**
 * The choropleth. Market countries are real buttons (focusable, Enter/Space to drill, aria-label with the value) drawn
 * last so their outline is never covered; every other country is decorative and hatched as "no data".
 * No business math here: classes and value text come from the scale built in the domain.
 */
export default function MapCanvas({
  rows,
  scale,
  selectedMarket,
  onSelect,
  onReadout,
}: {
  rows: readonly MarketRow[];
  scale: MapScale;
  selectedMarket: string | null;
  onSelect: (marketId: string) => void;
  onReadout: (readout: Readout | null) => void;
}) {
  const byNumericId = new Map(rows.map((row) => [numericIdForIso3(row.market.iso3), row] as const));

  return (
    <ComposableMap projection="geoEqualEarth" projectionConfig={{ scale: 150 }} width={800} height={410} className="block h-auto w-full">
      <defs>
        <pattern id={NO_DATA_PATTERN_ID} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--scale-nodata)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-border-strong)" strokeWidth="1" />
        </pattern>
      </defs>
      <Geographies geography={topology as unknown as GeoJsonObject}>
        {({ geographies }) => {
          const land = geographies.filter((g) => String(g.id) !== ANTARCTICA);
          const others = land.filter((g) => !byNumericId.has(String(g.id)));
          const marketGeos = rows.flatMap((row) => {
            const geo = land.find((g) => String(g.id) === numericIdForIso3(row.market.iso3));
            return geo ? [{ row, geo }] : [];
          });
          return (
            <>
              {others.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={`url(#${NO_DATA_PATTERN_ID})`}
                  stroke="var(--color-surface)"
                  strokeWidth={0.4}
                  aria-hidden="true"
                  tabIndex={-1}
                  focusable="false"
                  onMouseEnter={() => onReadout({ name: String(geo.properties?.name ?? "Unknown"), row: null })}
                  onMouseLeave={() => onReadout(null)}
                />
              ))}
              {marketGeos.map(({ row, geo }) => {
                const cls = scale.classify(row);
                const selected = row.market.id === selectedMarket;
                const value = scale.valueText(row);
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    className="map-country"
                    role="button"
                    tabIndex={0}
                    aria-label={`${row.market.name}: ${scale.title} ${value}${selected ? ", selected" : ""}. Press Enter to open.`}
                    aria-pressed={selected}
                    fill={cls === null ? `url(#${NO_DATA_PATTERN_ID})` : classColor(scale, cls)}
                    stroke={selected ? "var(--color-text)" : "var(--color-surface)"}
                    strokeWidth={selected ? 2.2 : 0.8}
                    onClick={() => onSelect(row.market.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(row.market.id);
                      }
                    }}
                    onMouseEnter={() => onReadout({ name: row.market.name, row })}
                    onMouseLeave={() => onReadout(null)}
                    onFocus={() => onReadout({ name: row.market.name, row })}
                    onBlur={() => onReadout(null)}
                  />
                );
              })}
            </>
          );
        }}
      </Geographies>
    </ComposableMap>
  );
}
