import "server-only";
import raw from "@/data/starter/data.json";
import { datasetSchema, formatPeriodLabel, scopeLabel, scopeMetrics, type Dataset, type Scope } from "@/domains/market";
import { formatPercent, formatUsdExact } from "@/shared/lib/format";

/** Words people use for a market that are not its dataset name. */
const MARKET_ALIASES: Record<string, string[]> = { gb: ["uk", "britain", "england"], us: ["usa", "u.s.", "america"] };

let cached: Dataset | undefined;
const dataset = () => (cached ??= datasetSchema.parse(raw));

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const WORD_BEFORE = "(?<![\\p{L}\\p{N}])";
const WORD_AFTER = "(?![\\p{L}\\p{N}])";
const wordRe = (term: string) => new RegExp(`${WORD_BEFORE}${escape(term)}${WORD_AFTER}`, "iu");

type Hit = { scope: Scope; at: number };

/** Entities a question names, in the order they appear: markets, regions and products (a product narrows the market before it). */
function findEntities(question: string, d: Dataset): Scope[] {
  let q = question;
  const hits: Hit[] = [];
  // Regions first and masked out, so "North America" is not also read as the alias "america" for the United States.
  for (const r of d.regions) {
    for (const term of new Set([r.name, r.id])) {
      const m = wordRe(term).exec(q);
      if (m) {
        hits.push({ scope: { regionId: r.id }, at: m.index });
        q = q.slice(0, m.index) + " ".repeat(m[0].length) + q.slice(m.index + m[0].length);
      }
    }
  }
  const products = d.products.filter((p) => wordRe(p.name).test(q));
  for (const mk of d.markets) {
    const terms = [mk.name, mk.iso3, ...(MARKET_ALIASES[mk.id] ?? [])];
    // Two-letter codes are deliberately not matched: "IT" and "IN" are ordinary words (and "IT" is not Italy).
    // "US" counts only in capitals: lower-case "us" is the pronoun.
    const m = terms.map((t) => wordRe(t).exec(q)).find(Boolean) ?? (mk.id === "us" ? /(?<![\p{L}\p{N}])US(?![\p{L}\p{N}])/u.exec(q) : null);
    if (!m) continue;
    if (products.length === 0) hits.push({ scope: { marketId: mk.id, regionId: mk.regionId }, at: m.index });
    else for (const p of products) hits.push({ scope: { marketId: mk.id, regionId: mk.regionId, productId: p.id }, at: m.index });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.scope).slice(0, 4);
}

type Lookup = { text: string; citations: { marketId?: string; regionId?: string; productId?: string; period: string }[] };

/**
 * A deterministic data lookup for questions the fixtures do not cover but that name a market, region or product
 * ("about UK", "find source data about Japan"). Every figure is computed from the dataset by the same functions the
 * dashboard uses, and each entity is cited, so the answer can be verified in the evidence drawer. It states figures;
 * it never explains causes, because the data cannot.
 */
export function lookupAnswer(question: string): Lookup | null {
  const d = dataset();
  const period = d.meta.latestPeriod;
  const scopes = findEntities(question, d);
  if (scopes.length === 0) return null;
  const lines: string[] = [];
  const citations: Lookup["citations"] = [];
  for (const scope of scopes) {
    const m = scopeMetrics(d, scope, period);
    const market = d.markets.find((x) => x.id === scope.marketId);
    const parts = [
      `revenue ${formatUsdExact(m.actual)}`,
      `${formatPercent(m.growthPct, { signed: true })} year on year`,
      `${formatPercent(m.attainmentPct)} of forecast (${m.gap >= 0 ? "+" : "−"}${formatUsdExact(Math.abs(m.gap))} versus forecast)`,
    ];
    if (market && !scope.productId) parts.push(`status ${market.kpis.status.replace("_", " ")} (supplied snapshot)`, `market share ${formatPercent(market.kpis.sharePct)} (supplied snapshot)`);
    const anomalies = market && !scope.productId ? market.kpis.anomalies.map((a) => `${formatPeriodLabel(a.period)}: ${a.note}`) : [];
    lines.push(`${scopeLabel(d, scope)}, ${formatPeriodLabel(period)}: ${parts.join("; ")}.${anomalies.length ? ` Flagged in the data: ${anomalies.join(" ")}` : ""}`);
    citations.push({ ...(scope.marketId ? { marketId: scope.marketId } : { regionId: scope.regionId ?? undefined }), ...(scope.productId ? { productId: scope.productId } : {}), period });
  }
  const note = "These are figures from the dataset, not an explanation. Ask “why” or “compare” questions for the prepared analyses.";
  return { text: `${lines.join(" ")} ${note}`, citations };
}
