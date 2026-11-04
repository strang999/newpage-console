"use client";

import { lazy, Suspense, useId, useMemo, useState } from "react";
import { buildComparison, formatPeriodLabel, MAX_COMPARE, MIN_COMPARE, type CompareType, type Dataset } from "@/domains/market";
import { formatPercent, formatUsdExact } from "@/shared/lib/format";
import { RawTable } from "./ui/raw-table";
import { summarize } from "./ui/summary";
import { seriesFor } from "./series";

const RadarView = lazy(() => import("./ui/radar"));

export type ComparisonSelection = { compareType: CompareType | null; compare: string[] };

const QUICK_START: ComparisonSelection = { compareType: "market", compare: ["de", "it", "gb"] };

type Draft = { type: CompareType; ids: string[] };
const keyOf = (type: CompareType | null, ids: readonly string[]) => (type && ids.length >= MIN_COMPARE ? `${type}|${ids.join(",")}` : "|");

export function MarketComparison({
  dataset,
  period,
  compareType,
  compare,
  onChange,
}: {
  dataset: Dataset;
  period: string;
  compareType: CompareType | null;
  compare: readonly string[];
  onChange: (selection: ComparisonSelection) => void;
}) {
  const name = useId();
  // The URL only holds a valid comparison (2-4 ids), so a half-made selection lives here until it becomes valid.
  const propsKey = keyOf(compareType, compare);
  const [seenKey, setSeenKey] = useState(propsKey);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ type: compareType ?? "market", ids: [...compare] });
  if (propsKey !== seenKey) {
    // The URL changed. If it was not our own write (back/forward, a link, the assistant), adopt it.
    setSeenKey(propsKey);
    if (propsKey !== lastSent) setDraft({ type: compareType ?? "market", ids: [...compare] });
    setLastSent(null); // the marker only covers the one URL change our own write causes
  }

  function update(next: Draft) {
    setDraft(next);
    const valid = next.ids.length >= MIN_COMPARE;
    setLastSent(keyOf(valid ? next.type : null, next.ids));
    onChange(valid ? { compareType: next.type, compare: next.ids } : { compareType: null, compare: [] });
  }

  const options = useMemo(
    () => (draft.type === "market" ? dataset.markets.map((m) => ({ id: m.id, name: m.name })) : dataset.regions.map((r) => ({ id: r.id, name: r.name }))),
    [dataset, draft.type],
  );
  const valid = draft.ids.length >= MIN_COMPARE;
  const comparison = useMemo(() => (valid ? buildComparison(dataset, { type: draft.type, ids: draft.ids, period }) : null), [valid, dataset, draft, period]);
  const periodLabel = formatPeriodLabel(period);
  const snapshotLabel = `supplied snapshot, ${formatPeriodLabel(dataset.meta.latestPeriod)}`;
  const entityWord = draft.type === "market" ? "markets" : "regions";

  return (
    <section aria-labelledby={`${name}-title`} className="rounded-md border border-border bg-surface p-4">
      <h2 id={`${name}-title`} className="text-lg font-semibold">
        Compare {entityWord}
      </h2>
      <p className="text-xs text-muted">
        Revenue, growth and attainment for {periodLabel} · derived · Source: dataset
      </p>

      <fieldset className="mt-3">
        <legend className="text-sm font-medium">
          Compare ({MIN_COMPARE}–{MAX_COMPARE} of the same type)
        </legend>
        <div className="mt-1 flex gap-2" role="radiogroup" aria-label="Compare by">
          {(["market", "region"] as const).map((t) => (
            <label key={t} className="cursor-pointer">
              <input type="radio" name={`${name}-type`} checked={draft.type === t} onChange={() => update({ type: t, ids: [] })} className="peer sr-only" />
              <span className="inline-block rounded-full border border-[var(--color-border-strong)] px-3 py-1 text-sm peer-checked:border-[var(--color-accent)] peer-checked:bg-[var(--color-accent-soft)] peer-checked:font-semibold peer-focus-visible:shadow-[var(--focus-ring)]">
                {t === "market" ? "Markets" : "Regions"}
              </span>
            </label>
          ))}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {options.map((o) => {
            const checked = draft.ids.includes(o.id);
            const atLimit = !checked && draft.ids.length >= MAX_COMPARE;
            return (
              <li key={o.id}>
                <label className={`flex items-center gap-1.5 text-sm ${atLimit ? "opacity-50" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={atLimit}
                    onChange={() => update({ ...draft, ids: checked ? draft.ids.filter((id) => id !== o.id) : [...draft.ids, o.id] })}
                  />
                  {o.name}
                </label>
              </li>
            );
          })}
        </ul>
        <p className="mt-1 text-xs text-muted" aria-live="polite">
          {draft.ids.length} selected{draft.ids.length >= MAX_COMPARE ? " (maximum reached)" : draft.ids.length < MIN_COMPARE ? ` · select at least ${MIN_COMPARE}` : ""}
        </p>
      </fieldset>

      {comparison ? (
        <div className="mt-4 flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <div className="h-[340px]" role="group" aria-label={`Radar chart comparing ${comparison.entities.map((e) => e.name).join(", ")} on revenue, growth and attainment. The table has the exact values.`}>
              <Suspense fallback={<p className="p-4 text-sm text-muted">Loading chart…</p>}>
                <RadarView comparison={comparison} />
              </Suspense>
            </div>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Series">
              {comparison.entities.map((e, i) => (
                <li key={e.id} className="flex items-center gap-1.5">
                  <svg width="28" height="8" aria-hidden="true">
                    <line x1="1" y1="4" x2="27" y2="4" stroke={seriesFor(i).color} strokeWidth="3" strokeDasharray={seriesFor(i).dash} />
                  </svg>
                  {e.name} ({seriesFor(i).label})
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <ul className="list-disc pl-5 text-sm">
              {summarize(comparison).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <details className="text-xs text-muted" open>
              <summary className="cursor-pointer font-medium text-[var(--color-text)]">How the radar is scaled</summary>
              <p className="mt-1">
                Each axis is scaled 0–100 across all {comparison.populationSize} {entityWord} in {periodLabel}, not across the selection, so a position does not move when you add or
                remove an entity. The outer ring is the best value in the whole set.
              </p>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3">
                {comparison.axes.map((a) => (
                  <div key={a.id} className="contents">
                    <dt className="font-medium text-[var(--color-text)]">{a.label}</dt>
                    <dd>
                      {a.degenerate
                        ? "every entity has the same value, so all are drawn at the neutral 50"
                        : a.id === "revenue"
                          ? `0 = ${formatUsdExact(a.min)}, 100 = ${formatUsdExact(a.max)}`
                          : a.id === "growth"
                            ? `0 = ${formatPercent(a.min, { signed: true })}, 100 = ${formatPercent(a.max, { signed: true })} (negative growth is not clipped)`
                            : `0 = ${formatPercent(a.min)}, 100 = ${formatPercent(a.max)}`}
                    </dd>
                  </div>
                ))}
              </dl>
              {comparison.type === "market" && <p className="mt-1">* Share is a {snapshotLabel}; it is shown but not plotted.</p>}
            </details>
          </div>
          </div>
          <RawTable comparison={comparison} periodLabel={periodLabel} snapshotLabel={snapshotLabel} />
        </div>
      ) : (
        <div className="mt-4 rounded-sm border border-dashed border-[var(--color-border-strong)] p-4 text-sm">
          <p>Pick {MIN_COMPARE} to {MAX_COMPARE} {entityWord} to compare them on one radar, with the exact values beside it.</p>
          <button
            type="button"
            onClick={() => update({ type: QUICK_START.compareType ?? "market", ids: [...QUICK_START.compare] })}
            className="mt-2 rounded-sm border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
          >
            Compare Germany, Italy and the United Kingdom
          </button>
        </div>
      )}
    </section>
  );
}
