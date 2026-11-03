"use client";

import { PortfolioOverview } from "@/features/portfolio-overview";
import { useDataset } from "./dataset-query";

/** Composition root for the dashboard surfaces. Features receive typed data; they never import each other. */
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
  return <PortfolioOverview dataset={data} />;
}
