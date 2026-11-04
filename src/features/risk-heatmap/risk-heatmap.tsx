"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { buildHeatmap, describeCell, formatGapPts, formatPeriodLabel, HEATMAP_CLASSES, type Dataset } from "@/domains/market";

export type HeatmapSelection = { market: string; period: string };

/** White text on the dark ends of the diverging scale, dark text on the light classes (contrast is checked in scripts/check-contrast.mjs). */
const textFor = (cls: number | null) => (cls === 0 || cls === 4 ? "var(--color-surface)" : "var(--color-text)");
const fillFor = (cls: number | null) => (cls === null ? "var(--scale-nodata)" : `var(--scale-div-${cls})`);

function shortMonth(period: string) {
  const year = period.split("-")[0] ?? "";
  return `${formatPeriodLabel(period).slice(0, 3)} ${year.slice(2)}`;
}

export function RiskHeatmap({
  dataset,
  regionId,
  selectedMarket,
  period,
  onSelect,
}: {
  dataset: Dataset;
  regionId: string | null;
  selectedMarket: string | null;
  period: string;
  onSelect: (selection: HeatmapSelection) => void;
}) {
  const name = useId();
  const heatmap = useMemo(() => buildHeatmap(dataset, { regionId }), [dataset, regionId]);
  const regionName = dataset.regions.find((r) => r.id === regionId)?.name;
  const periodIndex = Math.max(0, heatmap.periods.indexOf(period));
  const selectedRow = heatmap.rows.findIndex((r) => r.marketId === selectedMarket);

  // Roving tabindex: exactly one cell is a tab stop. It defaults to the selected cell, else the selected period's column.
  const [active, setActive] = useState<{ r: number; c: number } | null>(null);
  const last = { r: heatmap.rows.length - 1, c: heatmap.periods.length - 1 };
  const current = {
    r: Math.min(active?.r ?? Math.max(0, selectedRow), last.r),
    c: Math.min(active?.c ?? periodIndex, last.c),
  };
  const cells = useRef(new Map<string, HTMLButtonElement>());

  function move(next: { r: number; c: number }) {
    const target = { r: Math.max(0, Math.min(last.r, next.r)), c: Math.max(0, Math.min(last.c, next.c)) };
    setActive(target);
    cells.current.get(`${target.r},${target.c}`)?.focus();
  }

  function onKeyDown(event: KeyboardEvent, r: number, c: number) {
    const ctrl = event.ctrlKey || event.metaKey;
    const moves: Record<string, { r: number; c: number } | undefined> = {
      ArrowRight: { r, c: c + 1 },
      ArrowLeft: { r, c: c - 1 },
      ArrowDown: { r: r + 1, c },
      ArrowUp: { r: r - 1, c },
      Home: ctrl ? { r: 0, c: 0 } : { r, c: 0 },
      End: ctrl ? { r: last.r, c: last.c } : { r, c: last.c },
      PageUp: { r: 0, c },
      PageDown: { r: last.r, c },
    };
    const next = moves[event.key];
    if (next) {
      event.preventDefault();
      move(next);
    }
  }

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <h2 id={`${name}-title`} className="text-lg font-semibold">
        Risk heatmap: {regionName ? `${regionName} markets` : "all markets"} by month
      </h2>
      <p className="text-xs text-muted">
        Forecast attainment minus 100, in percentage points · derived · Source: dataset. Select a cell to open that market in that month.
      </p>

      <div className="mt-3 scroll-pl-32 overflow-x-auto rounded-sm border border-border" role="region" aria-labelledby={`${name}-title`}>
        <table role="grid" aria-describedby={`${name}-help`} className="border-collapse text-[11px]">
          <caption className="sr-only">
            {regionName ?? "All"} markets by month: forecast attainment minus 100 in percentage points. Use the arrow keys to move between cells, Enter to select.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-surface px-2 py-1 text-left text-xs font-semibold">
                Market
              </th>
              {heatmap.periods.map((p, c) => (
                <th key={p} scope="col" className={`px-0.5 py-1 text-center font-medium ${c === periodIndex ? "bg-[var(--color-accent-soft)] font-bold" : "text-muted"}`} aria-label={formatPeriodLabel(p)}>
                  <span aria-hidden="true">{shortMonth(p)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmap.rows.map((row, r) => (
              <tr key={row.marketId}>
                <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-surface px-2 py-0.5 text-left text-xs font-medium">
                  {row.name}
                </th>
                {heatmap.cells[r]?.map((cell, c) => {
                  const selected = cell.marketId === selectedMarket && cell.period === period;
                  const isTabStop = r === current.r && c === current.c;
                  return (
                    <td key={cell.period} role="gridcell" aria-selected={selected} className="p-px">
                      <button
                        type="button"
                        ref={(el) => {
                          if (el) cells.current.set(`${r},${c}`, el);
                          else cells.current.delete(`${r},${c}`);
                        }}
                        tabIndex={isTabStop ? 0 : -1}
                        aria-label={describeCell(row.name, cell)}
                        aria-pressed={selected}
                        onClick={() => {
                          setActive({ r, c });
                          onSelect({ market: cell.marketId, period: cell.period });
                        }}
                        // A pointer press must not move focus: focusing a cell next to the sticky market column scrolls the grid
                        // between press and release, so the tap lands elsewhere and the click is lost. Keyboard focus is unaffected.
                        onMouseDown={(e) => e.preventDefault()}
                        onKeyDown={(e) => onKeyDown(e, r, c)}
                        onFocus={() => setActive({ r, c })}
                        className="heat-cell block h-7 w-[38px] rounded-[3px] text-center font-medium tabular-nums"
                        style={{ background: fillFor(cell.cls), color: textFor(cell.cls) }}
                        data-selected={selected || undefined}
                      >
                        {formatGapPts(cell.gapPts)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p id={`${name}-help`} className="mt-1 text-xs text-muted">
        Arrow keys move between cells, Home and End jump along a row, Page Up and Page Down along a column, Enter or Space selects. Every cell shows its number; colour is a second cue.
      </p>

      <div className="mt-2">
        <p className="text-xs font-semibold">Points versus forecast</p>
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {HEATMAP_CLASSES.map((c, i) => (
            <li key={c.label} className="flex items-center gap-1.5 text-xs">
              <span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm border border-[var(--color-text-muted)]" style={{ background: fillFor(i) }} />
              {c.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
