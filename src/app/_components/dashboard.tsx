"use client";

import { useSyncExternalStore } from "react";
import { AssistantPanel } from "@/features/assistant";
import { MarketExplorer } from "@/features/market-explorer";
import { MarketComparison } from "@/features/market-comparison";
import { MarketMap } from "@/features/market-map";
import { RiskHeatmap } from "@/features/risk-heatmap";
import { PortfolioOverview } from "@/features/portfolio-overview";
import { useViewState } from "../_url/use-view-state";
import { useDataset } from "./dataset-query";

/** Composition root for the dashboard surfaces. Features receive typed data and callbacks; they never import each other. */
export function Dashboard() {
  const { data, error, isPending } = useDataset();

  if (isPending) {
    return <p role="status">Loading dataset…</p>;
  }
  if (error || !data) {
    return (
      <p role="alert" className="rounded-md border border-border bg-surface p-4">
        The dataset could not be loaded. Reload the page to try again.
      </p>
    );
  }
  return <DashboardView dataset={data} />;
}

const noopSubscribe = () => () => undefined;

function DashboardView({ dataset }: { dataset: NonNullable<ReturnType<typeof useDataset>["data"]> }) {
  const { state, navigate } = useViewState(dataset);
  const scope = { regionId: state.region, marketId: state.market, productId: state.product };

  // false in the server HTML, true once React has hydrated. End-to-end tests wait for it before interacting.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  return (
    <div data-hydrated={hydrated} className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col gap-8">
      <MarketExplorer
        dataset={dataset}
        scope={scope}
        period={state.period}
        onSelect={(selection) => navigate(selection)}
        onPeriodChange={(period) => navigate({ period })}
      />
      <MarketMap
        dataset={dataset}
        period={state.period}
        metric={state.metric}
        selectedMarket={state.market}
        onMetricChange={(metric) => navigate({ metric })}
        onSelectMarket={(market) => navigate({ market })}
      />
      <RiskHeatmap
        dataset={dataset}
        regionId={state.region}
        selectedMarket={state.market}
        period={state.period}
        onSelect={({ market, period }) => navigate({ market, period })}
      />
      <MarketComparison
        dataset={dataset}
        period={state.period}
        compareType={state.compareType}
        compare={state.compare}
        onChange={(selection) => navigate(selection)}
      />
      <PortfolioOverview dataset={dataset} period={state.period} onSelectMarket={(market) => navigate({ market })} />
      </div>
      <div className="xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)] xl:self-start">
        <AssistantPanel dataset={dataset} onOpenEvidence={(t) => navigate({ region: t.region, market: t.market, product: t.product, period: t.period })} />
      </div>
    </div>
  );
}
