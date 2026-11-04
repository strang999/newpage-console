"use client";

import type { ReactNode } from "react";
import { scopeLabel, type Dataset, type Scope } from "@/domains/market";
import { formatPeriod } from "@/shared/lib/format";
import type { ScopeSelection } from "./types";
import { Breadcrumb } from "./ui/breadcrumb";
import { ChildrenTable } from "./ui/children-table";
import { PeriodPicker } from "./ui/period-picker";
import { TrendPanel } from "./ui/trend-panel";

/**
 * Drill path, period, trend and (optionally) the next level down. The host composes around it through slots, so this
 * feature never imports another one: `actions` sits beside the period picker, `afterHeader` between the title and the trend.
 */
export function MarketExplorer({
  dataset,
  scope,
  period,
  onSelect,
  onPeriodChange,
  showChildren = true,
  actions,
  afterHeader,
}: {
  dataset: Dataset;
  scope: Scope;
  period: string;
  onSelect: (selection: ScopeSelection) => void;
  onPeriodChange: (period: string) => void;
  showChildren?: boolean;
  actions?: ReactNode;
  afterHeader?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Breadcrumb dataset={dataset} scope={scope} onSelect={onSelect} />
          <h1 className="mt-1 text-[length:var(--text-2xl)] font-semibold leading-tight tracking-tight">{scopeLabel(dataset, scope)}</h1>
          <p className="text-sm text-muted">{formatPeriod(period)} · USD</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {actions}
          <PeriodPicker periods={dataset.meta.periods} value={period} onChange={onPeriodChange} />
        </div>
      </div>
      {afterHeader}
      <TrendPanel dataset={dataset} scope={scope} period={period} />
      {showChildren && <ChildrenTable dataset={dataset} scope={scope} period={period} onSelect={onSelect} />}
    </div>
  );
}
