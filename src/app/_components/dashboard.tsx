"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ComponentProps } from "react";
import type { AssistantPanel } from "@/features/assistant";
import { CommandPalette } from "@/features/command-palette";
import { ExecutiveSummary } from "@/features/executive-summary";
import { MarketExplorer } from "@/features/market-explorer";
import { MarketMap } from "@/features/market-map";
import { MarketsTable, PortfolioHealth } from "@/features/portfolio-overview";
import { useMediaQuery } from "@/shared/lib/use-media-query";
import { ErrorBoundary, SurfaceFallback } from "@/shared/ui/error-boundary";
import { createRetryableLazy, LazySurface } from "@/shared/ui/lazy-surface";
import { formatPeriodLabel, scopeLabel } from "@/domains/market";
import { useViewState } from "../_url/use-view-state";
import { useDataset } from "./dataset-query";
import { LiveToggle } from "./live-toggle";
import { ModeToggle } from "./mode-toggle";
import { useLiveDataset } from "./use-live-dataset";

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

// Analyst-only surfaces are loaded on demand, so the executive first load does not pay for the form library, the
// heatmap or the comparison (see docs/performance.md). A failed chunk can be retried (see LazySurface).
// The assistant (stream client, reducer, schemas) is not needed to paint the dashboard, and on a phone it sits in a drawer that
// starts closed: its code loads when the drawer is first opened, or straight away on a wide screen where it is the side column.
const assistant = createRetryableLazy<ComponentProps<typeof AssistantPanel>>(() => import("@/features/assistant").then((m) => m.AssistantPanel));
const factTable = createRetryableLazy(() => import("@/features/fact-table").then((m) => m.FactTable));
const alertRules = createRetryableLazy(() => import("@/features/alert-rules").then((m) => m.AlertRules));
const marketComparison = createRetryableLazy(() => import("@/features/market-comparison").then((m) => m.MarketComparison));
const riskHeatmap = createRetryableLazy(() => import("@/features/risk-heatmap").then((m) => m.RiskHeatmap));

const noopSubscribe = () => () => undefined;

/** Contains a failure of one surface to that surface: the rest of the dashboard keeps working. */
function Guard({ surface, title, children }: { surface: string; title: string; children: React.ReactNode }) {
  return (
    <ErrorBoundary surface={surface} fallback={(retry) => <SurfaceFallback title={`${title} is unavailable.`} detail="The rest of the dashboard is not affected." retry={retry} />}>
      {children}
    </ErrorBoundary>
  );
}

function DashboardView({ dataset: base }: { dataset: NonNullable<ReturnType<typeof useDataset>["data"]> }) {
  // `base` is the supplied dataset (what the assistant and its evidence use); `dataset` is what the dashboard draws, which a
  // simulated live feed may nudge. The view state (URL) is reconciled against `base`: ids and periods never change.
  const { state, navigate } = useViewState(base);
  const [liveOn, setLiveOn] = useState(false);
  const { dataset, updatedAt } = useLiveDataset(base, liveOn);
  const scope = { regionId: state.region, marketId: state.market, productId: state.product };
  const analyst = state.mode === "analyst";

  // false in the server HTML, true once React has hydrated. End-to-end tests wait for it before interacting.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  // Below the xl breakpoint the assistant is a full-screen modal drawer. It stays mounted while closed, so the
  // conversation (and a running generation) survives opening and closing it. At xl and above it is the side column.
  const desktop = useMediaQuery("(min-width: 1280px)");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const drawerOpen = assistantOpen && !desktop;
  // Once mounted the assistant stays mounted, so the conversation (and a running answer) survives closing the drawer or resizing.
  const [assistantMounted, setAssistantMounted] = useState(false);
  if (!assistantMounted && (desktop || assistantOpen)) setAssistantMounted(true);
  const drawer = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (drawerOpen) drawer.current?.focus();
    else if (wasOpen.current) opener.current?.focus();
    wasOpen.current = drawerOpen;
  }, [drawerOpen]);
  useEffect(() => {
    // The drawer is a modal: the page behind must not scroll while it is open.
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);
  useEffect(() => {
    // Growing to the desktop layout forgets the open state, so narrowing again does not pop the drawer open.
    const mql = window.matchMedia("(min-width: 1280px)");
    const onChange = () => mql.matches && setAssistantOpen(false);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const selectMarket = (market: string) => navigate({ market });

  const explorer = (
    <MarketExplorer
      dataset={dataset}
      scope={scope}
      period={state.period}
      onSelect={(selection) => navigate(selection)}
      onPeriodChange={(period) => navigate({ period })}
      showChildren={analyst}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <LiveToggle on={liveOn} onChange={setLiveOn} updatedAt={updatedAt} />
          <CommandPalette dataset={base} onSelect={(selection) => navigate(selection)} />
          <ModeToggle mode={state.mode} onChange={(mode) => navigate({ mode })} />
        </div>
      }
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
      <div className="flex min-w-0 flex-col gap-6" inert={drawerOpen}>
        {explorer}
        {analyst ? (
          <>
            <Guard surface="markets-table" title="The markets table">
              <MarketsTable dataset={dataset} period={state.period} onSelectMarket={selectMarket} />
            </Guard>
            <LazySurface surface="fact-table" title="The monthly facts table" handle={factTable} loadingMinHeight="30rem">
              {(Facts) => <Facts dataset={dataset} scope={scope} />}
            </LazySurface>
            {map}
            <LazySurface surface="heatmap" title="The risk heatmap" handle={riskHeatmap} loadingMinHeight="26rem">
              {(Heatmap) => (
                <Heatmap dataset={dataset} regionId={state.region} selectedMarket={state.market} period={state.period} onSelect={({ market, period }) => navigate({ market, period })} />
              )}
            </LazySurface>
            <LazySurface surface="comparison" title="The comparison" handle={marketComparison} loadingMinHeight="22rem">
              {(Comparison) => (
                <Comparison dataset={dataset} period={state.period} compareType={state.compareType} compare={state.compare} onChange={(selection) => navigate(selection)} />
              )}
            </LazySurface>
            <LazySurface surface="alerts" title="Alert rules" handle={alertRules} loadingMinHeight="24rem">
              {(Alerts) => <Alerts dataset={dataset} />}
            </LazySurface>
          </>
        ) : (
          <>
            <Guard surface="executive-summary" title="Top risks and movers">
              <ExecutiveSummary dataset={dataset} period={state.period} onSelectMarket={selectMarket} />
            </Guard>
            {map}
          </>
        )}
      </div>

      <button
        ref={opener}
        type="button"
        aria-expanded={drawerOpen}
        aria-controls="assistant-drawer"
        onClick={() => setAssistantOpen(true)}
        inert={drawerOpen}
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
        role={drawerOpen ? "dialog" : undefined}
        aria-modal={drawerOpen ? true : undefined}
        aria-label={drawerOpen ? "Assistant" : undefined}
        onKeyDown={(e) => {
          // Escape inside the evidence <dialog> closes only that dialog; the drawer closes on the next press.
          if (e.key === "Escape" && drawerOpen && !(e.target instanceof Element && e.target.closest("dialog"))) setAssistantOpen(false);
        }}
        className={
          drawerOpen
            ? "fixed inset-0 z-40 flex flex-col gap-2 overscroll-contain bg-canvas p-3 outline-none"
            : "hidden xl:sticky xl:top-4 xl:block xl:h-[calc(100vh-2rem)] xl:self-start"
        }
      >
        {drawerOpen && (
          <button type="button" onClick={() => setAssistantOpen(false)} className="self-end rounded-sm border px-3 py-1.5 text-sm font-medium" style={{ borderColor: "var(--color-border-strong)" }}>
            Close assistant
          </button>
        )}
        <div className="min-h-0 flex-1 xl:h-full">
          {assistantMounted && (
            <LazySurface surface="assistant" title="The assistant" handle={assistant} loadingMinHeight="420px" className="h-full">
              {(Assistant) => (
                <Assistant
                  dataset={base}
                  view={{
                    context: { period: state.period, ...(scope.regionId ? { regionId: scope.regionId } : {}), ...(scope.marketId ? { marketId: scope.marketId } : {}), ...(scope.productId ? { productId: scope.productId } : {}) },
                    label: `${scopeLabel(dataset, scope)} · ${formatPeriodLabel(state.period)}`,
                  }}
                  onOpenEvidence={(t) => {
                    navigate({ region: t.region, market: t.market, product: t.product, period: t.period });
                    setAssistantOpen(false); // on a phone the drawer covers the dashboard: close it so the effect is visible
                  }}
                />
              )}
            </LazySurface>
          )}
        </div>
      </div>
    </div>
  );
}
