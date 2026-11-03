"use client";

import { scopeLabel, type Dataset, type Scope } from "@/domains/market";
import { formatPeriod } from "@/shared/lib/format";
import type { ScopeSelection } from "./types";
import { Breadcrumb } from "./ui/breadcrumb";
import { ChildrenTable } from "./ui/children-table";
import { PeriodPicker } from "./ui/period-picker";
import { TrendPanel } from "./ui/trend-panel";

export function MarketExplorer({
  dataset,
  scope,
  period,
  onSelect,
  onPeriodChange,
}: {
  dataset: Dataset;
  scope: Scope;
  period: string;
  onSelect: (selection: ScopeSelection) => void;
  onPeriodChange: (period: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Breadcrumb dataset={dataset} scope={scope} onSelect={onSelect} />
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{scopeLabel(dataset, scope)}</h1>
          <p className="text-sm text-muted">{formatPeriod(period)} · USD</p>
        </div>
        <PeriodPicker periods={dataset.meta.periods} value={period} onChange={onPeriodChange} />
      </div>
      <TrendPanel dataset={dataset} scope={scope} period={period} />
      <ChildrenTable dataset={dataset} scope={scope} period={period} onSelect={onSelect} />
    </div>
  );
}
