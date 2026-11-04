export { datasetSchema, statusSchema } from "./schema";
export type { Dataset, Fact, Market, MarketStatus, Product, Region } from "./schema";
export { marketRows, metricsFor, metricsFromFacts, portfolioHealth, selectFacts, statusCounts } from "./metrics";
export type { FactFilter, MarketRow, Metrics, PortfolioHealth, Provenance, StatusCounts } from "./metrics";
export { childRows, scopeLabel, scopeLevel, scopeMetrics, timeSeries } from "./scope";
export type { ChildKind, ChildRow, Scope, ScopeLevel, SeriesPoint } from "./scope";
export {
  COMPARE_TYPES,
  MAP_METRICS,
  MAX_COMPARE,
  MIN_COMPARE,
  MODES,
  parseViewState,
  reconcileViewState,
  selectInView,
  serializeViewState,
} from "./view-state";
export type { CompareType, MapMetric, Mode, ParamsLike, ParsedViewState, ViewState, ViewStateInput } from "./view-state";
export { resolveCitation } from "./evidence";
export type { CitationInput, EvidenceSnapshot, EvidenceTarget, ResolvedEvidence } from "./evidence";
export { formatPeriodLabel } from "./period";
export { numericIdForIso3 } from "./geo";
export { buildMapScale } from "./map-scale";
export type { MapScale, ScaleKind } from "./map-scale";
export { STATUS_META } from "./status";
export { buildComparison } from "./comparison";
export type { AxisId, Comparison, ComparisonAxis, ComparisonEntity } from "./comparison";
export { buildHeatmap, classifyGap, describeCell, formatGapPts, HEATMAP_BOUNDS, HEATMAP_CLASSES } from "./heatmap";
export type { Heatmap, HeatmapCell } from "./heatmap";
