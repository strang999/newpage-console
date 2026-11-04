import "server-only";
import raw from "@/data/starter/data.json";
import { datasetSchema, formatPeriodLabel, scopeLabel, scopeMetrics, type Dataset, type Scope } from "@/domains/market";
import type { ViewContext } from "./model/context";
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
type Found = { index: number; length: number };

/** Edit distance counting a swap of two neighbouring letters as one edit ("frnace" -> "france"). */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min((d[i - 1]?.[j] ?? 0) + 1, (d[i]?.[j - 1] ?? 0) + 1, (d[i - 1]?.[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, (d[i - 2]?.[j - 2] ?? 0) + 1);
      (d[i] as number[])[j] = best;
    }
  }
  return d[a.length]?.[b.length] ?? Infinity;
}

/**
 * Where `name` appears in the question: an exact whole-word match, or for a single word of five letters or more a
 * close misspelling (one edit, two from eight letters: "fracne", "gemany", "Brasil"). Short names, two-word names
 * and aliases ("UK") are exact only, so ordinary words are not mistaken for them.
 */
function locate(q: string, name: string): Found | null {
  const exact = wordRe(name).exec(q);
  if (exact) return { index: exact.index, length: exact[0].length };
  if (name.length < 5 || /\s/.test(name)) return null;
  const allowed = name.length >= 8 ? 2 : 1;
  for (const word of q.matchAll(/\p{L}+/gu)) {
    const w = word[0].toLowerCase();
    if (Math.abs(w.length - name.length) <= allowed && editDistance(w, name.toLowerCase()) <= allowed) return { index: word.index ?? 0, length: w.length };
  }
  return null;
}

const NOT_A_MARKET_BEFORE_US = new Set(["tell", "show", "give", "let", "send", "help", "join", "between", "among", "hello", "hi", "thank", "thanks"]);

/** Entities a question names, in the order they appear: markets, regions and products (a product narrows the market before it). */
function findEntities(question: string, d: Dataset): Scope[] {
  let q = question;
  const hits: Hit[] = [];
  // Regions first and masked out, so "North America" is not also read as the alias "america" for the United States.
  for (const r of d.regions) {
    const m = [r.name, r.id].map((term) => locate(q, term)).find(Boolean);
    if (m) {
      hits.push({ scope: { regionId: r.id }, at: m.index });
      q = q.slice(0, m.index) + " ".repeat(m.length) + q.slice(m.index + m.length);
    }
  }
  const products = d.products.filter((p) => locate(q, p.name));
  const marketHits: { id: string; regionId: string; at: number }[] = [];
  for (const mk of d.markets) {
    // Codes count only in capitals ("CAN", "JPN"): lower-case "can" is a verb. Two-letter codes are not matched at all,
    // because "IT" and "IN" are ordinary words (and "IT" is not Italy).
    const code = new RegExp(`${WORD_BEFORE}${mk.iso3}${WORD_AFTER}`, "u").exec(q);
    const m = [mk.name, ...(MARKET_ALIASES[mk.id] ?? [])].map((t) => locate(q, t)).find(Boolean) ?? (code ? { index: code.index, length: 3 } : null);
    if (m) marketHits.push({ id: mk.id, regionId: mk.regionId, at: m.index });
  }
  // "us": the pronoun on its own, but the United States when it sits in a list of other places ("france japan us data").
  // Capital "US" always counts.
  const us = d.markets.find((m) => m.id === "us");
  if (us && !marketHits.some((h) => h.id === "us")) {
    for (const word of q.matchAll(/(?<![\p{L}\p{N}])us(?![\p{L}\p{N}])/giu)) {
      const before = /(\p{L}+)\W*$/u.exec(q.slice(0, word.index))?.[1]?.toLowerCase();
      const capital = word[0] === "US";
      if (capital || ((marketHits.length > 0 || hits.length > 0) && !(before && NOT_A_MARKET_BEFORE_US.has(before)))) {
        marketHits.push({ id: "us", regionId: us.regionId, at: word.index ?? 0 });
        break;
      }
    }
  }
  for (const h of marketHits) {
    if (products.length === 0) hits.push({ scope: { marketId: h.id, regionId: h.regionId }, at: h.at });
    else for (const p of products) hits.push({ scope: { marketId: h.id, regionId: h.regionId, productId: p.id }, at: h.at });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.scope).slice(0, 4);
}

type Lookup = { text: string; citations: { marketId?: string; regionId?: string; productId?: string; period: string }[] };

/** Words that point at what the dashboard is showing rather than naming something ("this market", "what am I looking at"). */
const POINTS_AT_VIEW = /(?<![\p{L}\p{N}])(this|here|current|currently|selected|shown|showing|displayed|looking at|on screen|on the screen|dashboard|view)(?![\p{L}\p{N}])/iu;

/** The context the dashboard sent, kept only where it names things that exist in the dataset. */
export function sanitizeContext(d: Dataset, context: ViewContext | undefined): ViewContext | undefined {
  if (!context || !d.meta.periods.includes(context.period)) return undefined;
  const market = d.markets.find((m) => m.id === context.marketId);
  const region = d.regions.find((r) => r.id === (market?.regionId ?? context.regionId));
  const product = market ? d.products.find((p) => p.id === context.productId) : undefined;
  return { period: context.period, ...(region ? { regionId: region.id } : {}), ...(market ? { marketId: market.id } : {}), ...(product ? { productId: product.id } : {}) };
}

/**
 * A deterministic data lookup for questions the fixtures do not cover but that name a market, region or product
 * ("about UK", "find source data about Japan"), or that point at the current view ("what am I looking at?"). Every
 * figure is computed from the dataset by the same functions the dashboard uses, and each entity is cited, so the
 * answer can be verified in the evidence drawer. It states figures; it never explains causes, because the data cannot.
 */
export function lookupAnswer(question: string, context?: ViewContext): Lookup | null {
  const d = dataset();
  const latest = d.meta.latestPeriod;
  const view = sanitizeContext(d, context);
  const named = findEntities(question, d);
  const fromView = named.length === 0 && view !== undefined && POINTS_AT_VIEW.test(question);
  if (named.length === 0 && !fromView) return null;
  const scopes: Scope[] = fromView ? [{ regionId: view.regionId, marketId: view.marketId, productId: view.productId }] : named;
  const period = fromView ? view.period : latest;
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
    const snapshot = market && !scope.productId && period === latest;
    if (snapshot) parts.push(`status ${market.kpis.status.replace("_", " ")} (supplied snapshot)`, `market share ${formatPercent(market.kpis.sharePct)} (supplied snapshot)`);
    const anomalies = snapshot ? market.kpis.anomalies.map((a) => `${formatPeriodLabel(a.period)}: ${a.note}`) : [];
    const lead = fromView ? `You are looking at ${scopeLabel(d, scope)}, ${formatPeriodLabel(period)}` : `${scopeLabel(d, scope)}, ${formatPeriodLabel(period)}`;
    lines.push(`${lead}: ${parts.join("; ")}.${anomalies.length ? ` Flagged in the data: ${anomalies.join(" ")}` : ""}`);
    citations.push({ ...(scope.marketId ? { marketId: scope.marketId } : scope.regionId ? { regionId: scope.regionId } : {}), ...(scope.productId ? { productId: scope.productId } : {}), period });
  }
  const note = "These are figures from the dataset, not an explanation. Ask “why” or “compare” questions for the prepared analyses.";
  return { text: `${lines.join(" ")} ${note}`, citations };
}
