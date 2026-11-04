import type { Metrics } from "./metrics";
import { scopeLabel, scopeMetrics, type Scope } from "./scope";
import type { Dataset, MarketStatus } from "./schema";
import { formatPeriodLabel } from "./period";

/** A pointer into the dataset as emitted by the assistant. Every field may be absent (see CONTRACT.md). */
export type CitationInput = { marketId?: string; regionId?: string; productId?: string; period?: string; label?: string };

/** The dashboard position a citation points at. Applying it to the URL is the host's job. */
export type EvidenceTarget = { region: string | null; market: string | null; product: string | null; period: string };

export type EvidenceSnapshot = {
  sharePct: number;
  status: MarketStatus;
  anomalies: { period: string; note: string }[];
};

export type ResolvedEvidence =
  | {
      status: "resolved";
      /** e.g. "Germany · Veltrix · Mar 2026" */
      title: string;
      scope: Scope;
      period: string;
      /** Derived from monthly facts for the cited period. */
      metrics: Metrics;
      /** The month before, for context. Null for the first period. */
      previous: { period: string; metrics: Metrics } | null;
      /** Supplied latest-period snapshot. Only for a market-level citation. */
      snapshot: EvidenceSnapshot | null;
      target: EvidenceTarget;
      /** Things the reader should know, e.g. no period cited so the latest was used. */
      notes: string[];
    }
  | { status: "unresolved"; reason: string; citation: CitationInput };

/**
 * Resolves a citation against the dataset. Never throws: anything it cannot verify becomes `unresolved`
 * with a reason, because an invented or unverifiable reference must be shown as such, not smoothed over.
 */
export function resolveCitation(dataset: Dataset, citation: CitationInput): ResolvedEvidence {
  const unresolved = (reason: string): ResolvedEvidence => ({ status: "unresolved", reason, citation });
  const notes: string[] = [];

  const market = citation.marketId ? dataset.markets.find((m) => m.id === citation.marketId) : undefined;
  if (citation.marketId && !market) return unresolved(`Unknown market “${citation.marketId}”.`);
  const region = citation.regionId ? dataset.regions.find((r) => r.id === citation.regionId) : undefined;
  if (citation.regionId && !region) return unresolved(`Unknown region “${citation.regionId}”.`);
  const product = citation.productId ? dataset.products.find((p) => p.id === citation.productId) : undefined;
  if (citation.productId && !product) return unresolved(`Unknown product “${citation.productId}”.`);
  if (market && region && market.regionId !== region.id) {
    return unresolved(`${market.name} is not in ${region.name}.`);
  }
  if (citation.period && !dataset.meta.periods.includes(citation.period)) {
    return unresolved(`Period ${citation.period} is outside the dataset (${dataset.meta.periods[0]} to ${dataset.meta.latestPeriod}).`);
  }

  const period = citation.period ?? dataset.meta.latestPeriod;
  if (!citation.period) notes.push(`No period was cited, so the latest period (${formatPeriodLabel(period)}) is shown.`);

  const regionId = market?.regionId ?? region?.id ?? null;
  const scope: Scope = { regionId, marketId: market?.id ?? null, productId: product?.id ?? null };
  if (product && !market) notes.push("A product needs a market to open in the dashboard, so the link opens the portfolio view.");

  const index = dataset.meta.periods.indexOf(period);
  const previousPeriod = index > 0 ? dataset.meta.periods[index - 1] : undefined;

  const snapshot: EvidenceSnapshot | null =
    market && !product
      ? {
          sharePct: market.kpis.sharePct,
          status: market.kpis.status,
          anomalies: market.kpis.anomalies.map((a) => ({ period: a.period, note: a.note })),
        }
      : null;

  return {
    status: "resolved",
    title: `${scopeLabel(dataset, scope)} · ${formatPeriodLabel(period)}`,
    scope,
    period,
    metrics: scopeMetrics(dataset, scope, period),
    previous: previousPeriod ? { period: previousPeriod, metrics: scopeMetrics(dataset, scope, previousPeriod) } : null,
    snapshot,
    target: { region: regionId, market: market?.id ?? null, product: market ? (product?.id ?? null) : null, period },
    notes,
  };
}
