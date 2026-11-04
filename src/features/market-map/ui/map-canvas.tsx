"use client";

import type { GeoJsonObject } from "geojson";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { numericIdForIso3, type MapScale, type MarketRow } from "@/domains/market";
import topology from "../data/countries-110m.json";
import { classColor } from "../colors";
import { mapPatterns } from "./patterns";

/** What the readout line is pointing at. Resolved against the current rows, so it can never show a stale value. */
export type Pointer = { kind: "market"; marketId: string } | { kind: "other"; name: string };

const ANTARCTICA = "010";
const patterns = mapPatterns("map");

/**
 * The choropleth. Market countries are real buttons (focusable, Enter/Space to drill, aria-label with the value) drawn
 * after the decorative land; every other country is `aria-hidden`, not focusable and hatched as "no data". The
 * selected and focused markets get a two-tone outline drawn on top, so the indicator is visible on any fill and is
 * never covered by a neighbour. No business math here: classes and value text come from the scale.
 */
export default function MapCanvas({
  rows,
  scale,
  selectedMarket,
  focusedMarket,
  onSelect,
  onHover,
  onFocusChange,
}: {
  rows: readonly MarketRow[];
  scale: MapScale;
  selectedMarket: string | null;
  focusedMarket: string | null;
  onSelect: (marketId: string) => void;
  onHover: (pointer: Pointer | null) => void;
  onFocusChange: (marketId: string | null) => void;
}) {
  const byNumericId = new Map(rows.map((row) => [numericIdForIso3(row.market.iso3), row] as const));

  const fillFor = (row: MarketRow) => {
    const cls = scale.classify(row);
    if (cls === null) return patterns.noData;
    return scale.kind === "categorical" ? patterns.categorical(cls) : classColor(scale, cls);
  };

  return (
    <ComposableMap projection="geoEqualEarth" projectionConfig={{ scale: 150, center: [0, -2] }} width={800} height={372} className="block h-auto w-full">
      {patterns.defs}
      <Geographies geography={topology as unknown as GeoJsonObject}>
        {({ geographies }) => {
          const land = geographies.filter((g) => String(g.id) !== ANTARCTICA);
          const others = land.filter((g) => !byNumericId.has(String(g.id)));
          const marketGeos = rows.flatMap((row) => {
            const geo = land.find((g) => String(g.id) === numericIdForIso3(row.market.iso3));
            return geo ? [{ row, geo }] : [];
          });
          const outlined = marketGeos.filter(({ row }) => row.market.id === selectedMarket || row.market.id === focusedMarket);
          return (
            <>
              {others.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={patterns.noData}
                  stroke="var(--color-surface)"
                  strokeWidth={0.4}
                  aria-hidden="true"
                  tabIndex={-1}
                  focusable="false"
                  onMouseEnter={() => onHover({ kind: "other", name: String(geo.properties?.name ?? "Unknown") })}
                  onMouseLeave={() => onHover(null)}
                />
              ))}
              {marketGeos.map(({ row, geo }) => {
                const selected = row.market.id === selectedMarket;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    className="map-country"
                    role="button"
                    tabIndex={0}
                    aria-label={`${row.market.name}: ${scale.title} ${scale.valueText(row)}${selected ? ", selected" : ""}. Press Enter to open.`}
                    aria-pressed={selected}
                    fill={fillFor(row)}
                    stroke="var(--color-text-muted)"
                    strokeWidth={0.7}
                    onClick={() => onSelect(row.market.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(row.market.id);
                      }
                    }}
                    onMouseEnter={() => onHover({ kind: "market", marketId: row.market.id })}
                    onMouseLeave={() => onHover(null)}
                    onFocus={() => onFocusChange(row.market.id)}
                    onBlur={() => onFocusChange(null)}
                  />
                );
              })}
              {/* Two-tone outline overlays: a white halo under a dark stroke reads on every fill; pointer events pass through. */}
              {outlined.map(({ row, geo }) => {
                const focused = row.market.id === focusedMarket;
                return (
                  <g key={`outline-${geo.rsmKey}`} pointerEvents="none" aria-hidden="true" data-testid={focused ? "map-focus-ring" : "map-selected-ring"}>
                    <Geography geography={geo} fill="none" stroke="#fff" strokeWidth={focused ? 6 : 4.5} tabIndex={-1} focusable="false" />
                    <Geography geography={geo} fill="none" stroke="var(--color-text)" strokeWidth={focused ? 3 : 2} strokeDasharray={focused ? undefined : "5 3"} tabIndex={-1} focusable="false" />
                  </g>
                );
              })}
            </>
          );
        }}
      </Geographies>
    </ComposableMap>
  );
}
