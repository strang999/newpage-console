"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { scopeLabel, type Dataset, type Scope } from "@/domains/market";
import { formatInteger, formatPercent, formatPeriod, formatUsdExact } from "@/shared/lib/format";
import { buildFactRows, sortFactRows, type FactSortDirection, type FactSortKey } from "../model/rows";
import { computeWindow } from "../model/window";

const ROW_HEIGHT = 36;
const VIEWPORT_HEIGHT = 440;
const OVERSCAN = 8;

type Column = { key: FactSortKey; label: string; align: "left" | "right"; first: FactSortDirection };

const COLUMNS: Column[] = [
  { key: "period", label: "Month", align: "left", first: "descending" },
  { key: "market", label: "Market", align: "left", first: "ascending" },
  { key: "product", label: "Product", align: "left", first: "ascending" },
  { key: "actual", label: "Actual", align: "right", first: "descending" },
  { key: "forecast", label: "Forecast", align: "right", first: "descending" },
  { key: "gap", label: "Gap", align: "right", first: "ascending" },
  { key: "attainment", label: "Attainment", align: "right", first: "ascending" },
  { key: "growth", label: "YoY growth", align: "right", first: "descending" },
  { key: "units", label: "Units", align: "right", first: "descending" },
];

const cell = "whitespace-nowrap px-2.5";

/**
 * Every monthly fact in the current scope as a dense, sortable table that stays smooth at full data volume (1,560 rows at
 * portfolio level): only the rows in view, plus a few either side, are in the page; spacer rows keep the scrollbar honest.
 * Rows carry aria-rowindex and the table aria-rowcount, so a screen reader still hears "row 812 of 1,561".
 */
export function FactTable({ dataset, scope }: { dataset: Dataset; scope: Scope }) {
  const [sort, setSort] = useState<{ key: FactSortKey; direction: FactSortDirection }>({ key: "period", direction: "descending" });
  const [scroll, setScroll] = useState({ top: 0, version: "" });
  const frame = useRef(0);

  const { regionId, marketId, productId } = scope;
  const stableScope = useMemo<Scope>(() => ({ regionId, marketId, productId }), [regionId, marketId, productId]);
  const label = scopeLabel(dataset, stableScope);
  const base = useMemo(() => buildFactRows(dataset, stableScope), [dataset, stableScope]);
  const rows = useMemo(() => sortFactRows(base, sort.key, sort.direction), [base, sort]);
  // A new sort or a new scope is a new `version`: the scroll container remounts at the top and the stored offset no longer applies.
  const version = `${sort.key}|${sort.direction}|${regionId ?? ""}|${marketId ?? ""}|${productId ?? ""}`;
  const scrollTop = scroll.version === version ? scroll.top : 0;
  const win = computeWindow({ scrollTop, viewportHeight: VIEWPORT_HEIGHT, rowHeight: ROW_HEIGHT, total: rows.length, overscan: OVERSCAN });
  const visible = rows.slice(win.start, win.end);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function toggle(column: Column) {
    setSort((current) => (current.key !== column.key ? { key: column.key, direction: column.first } : { key: column.key, direction: current.direction === "ascending" ? "descending" : "ascending" }));
  }

  const inView = Math.min(rows.length, Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT));
  const firstInView = Math.min(rows.length, Math.floor(scrollTop / ROW_HEIGHT) + 1);

  return (
    <section aria-labelledby="fact-table-heading" className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="fact-table-heading" className="text-lg font-semibold">
          Monthly facts · {label}
        </h2>
        <p className="text-xs text-muted" data-testid="fact-table-range">
          {rows.length === 0 ? "No rows." : `Rows ${formatInteger(firstInView)}–${formatInteger(Math.min(rows.length, firstInView + inView - 1))} of ${formatInteger(rows.length)}`} · sorted by{" "}
          {COLUMNS.find((c) => c.key === sort.key)?.label}, {sort.direction}
        </p>
      </div>
      <p className="mt-1 text-xs text-muted">Source: dataset, derived from the monthly facts. Only the rows in view are drawn; scroll or use the arrow, Page and Home/End keys.</p>
      <div
        key={version}
        role="region"
        aria-label="Monthly facts table, scrollable"
        tabIndex={0}
        onScroll={(e) => {
          const top = e.currentTarget.scrollTop;
          cancelAnimationFrame(frame.current);
          frame.current = requestAnimationFrame(() => setScroll({ top, version }));
        }}
        className="mt-3 overflow-auto rounded-md border border-border bg-surface"
        style={{ height: VIEWPORT_HEIGHT }}
      >
        <table className="w-full min-w-[860px] border-collapse text-sm" aria-rowcount={rows.length + 1}>
          <caption className="sr-only">
            Monthly actual revenue, forecast, gap, forecast attainment, year-on-year growth and units for {label}, {formatInteger(rows.length)} rows. Select a column heading to sort by it.
          </caption>
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-sunken)]">
            <tr aria-rowindex={1}>
              {COLUMNS.map((c) => {
                const active = sort.key === c.key;
                return (
                  <th key={c.key} scope="col" aria-sort={active ? sort.direction : "none"} className={`whitespace-nowrap border-b border-border text-xs font-semibold text-muted ${c.align === "right" ? "text-right" : "text-left"}`}>
                    <button type="button" onClick={() => toggle(c)} className={`inline-flex w-full items-center gap-1 px-2.5 py-2 ${c.align === "right" ? "justify-end" : "justify-start"} ${active ? "text-[var(--color-text)]" : ""}`}>
                      {c.label}
                      <svg width="9" height="12" viewBox="0 0 9 12" aria-hidden="true" className={active ? "" : "opacity-30"}>
                        <path d="M4.5 0L9 5H0z" fill="currentColor" opacity={active && sort.direction === "descending" ? 0.25 : 1} />
                        <path d="M4.5 12L0 7h9z" fill="currentColor" opacity={active && sort.direction === "ascending" ? 0.25 : 1} />
                      </svg>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {win.before > 0 && (
              <tr aria-hidden="true" style={{ height: win.before }}>
                <td colSpan={COLUMNS.length} />
              </tr>
            )}
            {visible.map((r, i) => (
              <tr key={r.key} aria-rowindex={win.start + i + 2} className="border-b border-border" style={{ height: ROW_HEIGHT }}>
                <td className={`${cell} tabular-nums`}>{formatPeriod(r.period)}</td>
                <td className={cell}>{r.market}</td>
                <td className={cell}>{r.product}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatUsdExact(r.actual)}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatUsdExact(r.forecast)}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatUsdExact(r.gap)}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatPercent(r.attainmentPct)}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatPercent(r.growthPct, { signed: true })}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatInteger(r.units)}</td>
              </tr>
            ))}
            {win.after > 0 && (
              <tr aria-hidden="true" style={{ height: win.after }}>
                <td colSpan={COLUMNS.length} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
