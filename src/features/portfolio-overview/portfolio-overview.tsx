"use client";

import { useMemo } from "react";
import { marketRows, portfolioHealth, type Dataset } from "@/domains/market";
import { formatPeriod } from "@/shared/lib/format";
import { KpiStrip } from "./ui/kpi-strip";
import { MarketTable } from "./ui/market-table";

export function PortfolioOverview({ dataset }: { dataset: Dataset }) {
  const period = dataset.meta.latestPeriod;
  const health = useMemo(() => portfolioHealth(dataset, period), [dataset, period]);
  const rows = useMemo(() => marketRows(dataset, period), [dataset, period]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio overview</h1>
        <p className="mt-1 text-sm text-muted">
          {formatPeriod(period)} · all {dataset.regions.length} regions, {dataset.markets.length} markets and{" "}
          {dataset.products.length} products
        </p>
      </header>
      <KpiStrip health={health} />
      <MarketTable rows={rows} period={period} />
    </div>
  );
}
