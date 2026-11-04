"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AssistantPanel } from "@/features/assistant";
import { ExecutiveSummary } from "@/features/executive-summary";
import { MarketComparison } from "@/features/market-comparison";
import { MarketExplorer } from "@/features/market-explorer";
import { MarketMap } from "@/features/market-map";
import { MarketsTable, PortfolioHealth } from "@/features/portfolio-overview";
import { RiskHeatmap } from "@/features/risk-heatmap";
import { useViewState } from "../_url/use-view-state";
import { useDataset } from "./dataset-query";
import { ModeToggle } from "./mode-toggle";

/** Composition root for the dashboard surfaces. Features receive typed data and callbacks; they never import each other. */
export function Dashboard() {
  const { data, error, isPending } = useDataset();

  if (isPending) {
    return <p role="status">Loading dataset…</p>;
  }
  if (error || !data) {
    return (
      <p role="alert" className="card">
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
  const analyst = state.mode === "analyst";

  // false in the server HTML, true once React has hydrated. End-to-end tests wait for it before interacting.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  // Below the xl breakpoint the assistant is a full-screen drawer. It stays mounted while closed, so the conversation
  // (and a running generation) survives opening and closing it.
  const [assistantOpen, setAssistantOpen] = useState(false);
  const drawer = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (assistantOpen) drawer.current?.focus();
    else if (wasOpen.current) opener.current?.focus();
    wasOpen.current = assistantOpen;
  }, [assistantOpen]);

  const selectMarket = (market: string) => navigate({ market });

  const explorer = (
    <MarketExplorer
      dataset={dataset}
      scope={scope}
      period={state.period}
      onSelect={(selection) => navigate(selection)}
      onPeriodChange={(period) => navigate({ period })}
      showChildren={analyst}
      actions={<ModeToggle mode={state.mode} onChange={(mode) => navigate({ mode })} />}
      afterHeader={<PortfolioHealth dataset={dataset} period={state.period} />}
    />
  );
  const map = (
    <MarketMap
      dataset={dataset}
      period={state.period}
      metric={state.metric}
      selectedMarket={state.market}
      onMetricChange={(metric) => navigate({ metric })}
      onSelectMarket={selectMarket}
    />
  );

  return (
    <div data-hydrated={hydrated} data-mode={state.mode} className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col gap-6">
        {explorer}
        {analyst ? (
          <>
            <MarketsTable dataset={dataset} period={state.period} onSelectMarket={selectMarket} />
            {map}
            <RiskHeatmap
              dataset={dataset}
              regionId={state.region}
              selectedMarket={state.market}
              period={state.period}
              onSelect={({ market, period }) => navigate({ market, period })}
            />
            <MarketComparison dataset={dataset} period={state.period} compareType={state.compareType} compare={state.compare} onChange={(selection) => navigate(selection)} />
          </>
        ) : (
          <>
            <ExecutiveSummary dataset={dataset} period={state.period} onSelectMarket={selectMarket} />
            {map}
          </>
        )}
      </div>

      <button
        ref={opener}
        type="button"
        aria-expanded={assistantOpen}
        aria-controls="assistant-drawer"
        onClick={() => setAssistantOpen(true)}
        className="fixed bottom-4 right-4 z-30 inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold shadow-lg xl:hidden"
        style={{ background: "var(--color-ai-border)", color: "#fff" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.5A8 8 0 1 1 21 12z" />
        </svg>
        Ask the assistant
      </button>

      <div
        id="assistant-drawer"
        ref={drawer}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape" && assistantOpen) setAssistantOpen(false);
        }}
        className={
          assistantOpen
            ? "fixed inset-0 z-40 flex flex-col gap-2 bg-canvas p-3 outline-none xl:static xl:z-auto xl:block xl:bg-transparent xl:p-0"
            : "hidden xl:sticky xl:top-4 xl:block xl:h-[calc(100vh-2rem)] xl:self-start"
        }
      >
        {assistantOpen && (
          <button type="button" onClick={() => setAssistantOpen(false)} className="self-end rounded-sm border px-3 py-1.5 text-sm font-medium xl:hidden" style={{ borderColor: "var(--color-border-strong)" }}>
            Close assistant
          </button>
        )}
        <div className="min-h-0 flex-1 xl:h-full">
          <AssistantPanel
            dataset={dataset}
            onOpenEvidence={(t) => {
              navigate({ region: t.region, market: t.market, product: t.product, period: t.period });
              setAssistantOpen(false); // on a phone the drawer covers the dashboard: close it so the effect is visible
            }}
          />
        </div>
      </div>
    </div>
  );
}
