"use client";

import { useMemo } from "react";
import { marketRows, portfolioHealth, type Dataset } from "@/domains/market";
import { KpiStrip } from "./ui/kpi-strip";
import { MarketTable } from "./ui/market-table";

type Common = {
  dataset: Dataset;
  /** Period for the derived figures. Share and status are always the supplied latest-period snapshot. */
  period?: string;
};

/** The four headline numbers. Both audiences get this strip. */
export function PortfolioHealth({ dataset, period = dataset.meta.latestPeriod }: Common) {
  const health = useMemo(() => portfolioHealth(dataset, period), [dataset, period]);
  return <KpiStrip health={health} snapshotPeriod={dataset.meta.latestPeriod} />;
}

/** The analyst's dense, sortable table of every market and metric. */
export function MarketsTable({ dataset, period = dataset.meta.latestPeriod, onSelectMarket }: Common & { onSelectMarket?: (marketId: string) => void }) {
  const rows = useMemo(() => marketRows(dataset, period), [dataset, period]);
  return <MarketTable rows={rows} period={period} snapshotPeriod={dataset.meta.latestPeriod} onSelectMarket={onSelectMarket} />;
}

/** Health strip, plus the dense table for the analyst variant. */
export function PortfolioOverview({
  dataset,
  period = dataset.meta.latestPeriod,
  variant = "analyst",
  onSelectMarket,
}: Common & { variant?: "executive" | "analyst"; onSelectMarket?: (marketId: string) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <PortfolioHealth dataset={dataset} period={period} />
      {variant === "analyst" && <MarketsTable dataset={dataset} period={period} onSelectMarket={onSelectMarket} />}
    </div>
  );
}
