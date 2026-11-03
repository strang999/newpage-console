import type { Dataset, MarketStatus } from "./schema";
import { statusSchema } from "./schema";

export const MODES = ["executive", "analyst"] as const;
export type Mode = (typeof MODES)[number];

export const MAP_METRICS = ["revenue", "growth", "attainment", "status"] as const;
export type MapMetric = (typeof MAP_METRICS)[number];

export const COMPARE_TYPES = ["market", "region"] as const;
export type CompareType = (typeof COMPARE_TYPES)[number];

export const MIN_COMPARE = 2;
export const MAX_COMPARE = 4;

/** Everything a shareable link must restore. The URL is the single source of truth for these fields. */
export type ViewState = {
  mode: Mode;
  region: string | null;
  market: string | null;
  product: string | null;
  period: string;
  metric: MapMetric;
  compareType: CompareType | null;
  compare: string[];
  status: MarketStatus | null;
};

/** Candidate values before reconciliation. Anything may be unknown, stale or missing. */
export type ViewStateInput = {
  mode?: string | null;
  region?: string | null;
  market?: string | null;
  product?: string | null;
  period?: string | null;
  metric?: string | null;
  compareType?: string | null;
  compare?: readonly string[] | null;
  status?: string | null;
};

export type ParamsLike = { get(name: string): string | null; toString(): string };

const DEFAULT_MODE: Mode = "executive";
const DEFAULT_METRIC: MapMetric = "revenue";

function oneOf<T extends string>(allowed: readonly T[], value: string | null | undefined): T | null {
  return allowed.find((a) => a === value) ?? null;
}

/**
 * Turns arbitrary input into a valid view state:
 * unknown ids are dropped; a market implies its region (a conflicting region is overridden);
 * a product needs a market; the period must exist in the dataset; a comparison needs
 * 2-4 distinct known ids of one type (more than 4 are truncated to the first 4).
 */
export function reconcileViewState(input: ViewStateInput, dataset: Dataset): ViewState {
  const marketsById = new Map(dataset.markets.map((m) => [m.id, m]));
  const regionIds = new Set(dataset.regions.map((r) => r.id));
  const productIds = new Set(dataset.products.map((p) => p.id));

  const market = input.market && marketsById.has(input.market) ? input.market : null;
  const marketRegion = market ? (marketsById.get(market)?.regionId ?? null) : null;
  const region = marketRegion ?? (input.region && regionIds.has(input.region) ? input.region : null);
  const product = market && input.product && productIds.has(input.product) ? input.product : null;

  const period =
    input.period && dataset.meta.periods.includes(input.period) ? input.period : dataset.meta.latestPeriod;

  const compareType = oneOf(COMPARE_TYPES, input.compareType);
  const status = statusSchema.safeParse(input.status);
  let compare: string[] = [];
  if (compareType) {
    const known = compareType === "market" ? new Set(marketsById.keys()) : regionIds;
    compare = [...new Set(input.compare ?? [])].filter((id) => known.has(id)).slice(0, MAX_COMPARE);
  }
  const validCompare = compareType !== null && compare.length >= MIN_COMPARE;

  return {
    mode: oneOf(MODES, input.mode) ?? DEFAULT_MODE,
    region,
    market,
    product,
    period,
    metric: oneOf(MAP_METRICS, input.metric) ?? DEFAULT_METRIC,
    compareType: validCompare ? compareType : null,
    compare: validCompare ? compare : [],
    status: status.success ? status.data : null,
  };
}

/** Canonical query string without the leading "?". Defaults are omitted, so the portfolio view is the empty string. */
export function serializeViewState(state: ViewState, dataset: Dataset): string {
  const p = new URLSearchParams();
  if (state.mode !== DEFAULT_MODE) p.set("mode", state.mode);
  if (state.region && !state.market) p.set("region", state.region);
  if (state.market && state.region) {
    p.set("region", state.region);
    p.set("market", state.market);
  }
  if (state.product) p.set("product", state.product);
  if (state.period !== dataset.meta.latestPeriod) p.set("period", state.period);
  if (state.metric !== DEFAULT_METRIC) p.set("metric", state.metric);
  if (state.compareType && state.compare.length >= MIN_COMPARE) {
    p.set("compareType", state.compareType);
    p.set("compare", state.compare.join(","));
  }
  if (state.status) p.set("status", state.status);
  return p.toString().replaceAll("%2C", ",");
}

export type ParsedViewState = {
  state: ViewState;
  /** Canonical query string for `state`. */
  canonical: string;
  /** True when the incoming query differs from the canonical one and the URL should be rewritten (replace, not push). */
  needsNormalization: boolean;
};

export function parseViewState(params: ParamsLike, dataset: Dataset): ParsedViewState {
  const compareRaw = params.get("compare");
  const state = reconcileViewState(
    {
      mode: params.get("mode"),
      region: params.get("region"),
      market: params.get("market"),
      product: params.get("product"),
      period: params.get("period"),
      metric: params.get("metric"),
      compareType: params.get("compareType"),
      compare: compareRaw ? compareRaw.split(",").filter(Boolean) : [],
      status: params.get("status"),
    },
    dataset,
  );
  const canonical = serializeViewState(state, dataset);
  const incoming = params.toString().replaceAll("%2C", ",");
  return { state, canonical, needsNormalization: incoming !== canonical };
}

/**
 * Applies a user selection on top of the current state and re-reconciles it.
 * Selecting a region clears market and product; selecting a market clears the product unless one is given.
 */
export function selectInView(
  state: ViewState,
  patch: Partial<Pick<ViewState, "mode" | "period" | "metric" | "compareType" | "compare" | "status">> & {
    region?: string | null;
    market?: string | null;
    product?: string | null;
  },
  dataset: Dataset,
): ViewState {
  const next = { ...state, ...patch };
  if ("region" in patch && !("market" in patch)) next.market = null;
  if (("region" in patch || "market" in patch) && !("product" in patch)) next.product = null;
  return reconcileViewState(next, dataset);
}
