"use client";

import { useMemo } from "react";
import { marketRows, portfolioHealth, type Dataset } from "@/domains/market";
import { KpiStrip } from "./ui/kpi-strip";
import { MarketTable } from "./ui/market-table";

export function PortfolioOverview({
  dataset,
  period = dataset.meta.latestPeriod,
  onSelectMarket,
}: {
  dataset: Dataset;
  /** Period for the derived figures. Share and status are always the supplied latest-period snapshot. */
  period?: string;
  onSelectMarket?: (marketId: string) => void;
}) {
  const health = useMemo(() => portfolioHealth(dataset, period), [dataset, period]);
  const rows = useMemo(() => marketRows(dataset, period), [dataset, period]);
  const snapshotPeriod = dataset.meta.latestPeriod;

  return (
    <div className="flex flex-col gap-6">
      <KpiStrip health={health} snapshotPeriod={snapshotPeriod} />
      <MarketTable rows={rows} period={period} snapshotPeriod={snapshotPeriod} onSelectMarket={onSelectMarket} />
    </div>
  );
}
