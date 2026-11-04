import type { Dataset, Fact } from "./schema";

/**
 * The dataset as it travels from the server to the browser. The 1,560 monthly facts are most of the page's bytes, and every
 * one of them repeats the same four keys and three ids as text, so they travel as one flat list of numbers instead
 * (stride 7: market index, product index, period index, actual, forecast, units, prior year). The document is on the
 * critical path of the first paint, so its size is time the user waits. `decodeDataset(encodeDataset(d))` equals `d`.
 */
export type WireDataset = Omit<Dataset, "series"> & { series: number[] };

const STRIDE = 7;

export function encodeDataset(dataset: Dataset): WireDataset {
  const market = new Map(dataset.markets.map((m, i) => [m.id, i]));
  const product = new Map(dataset.products.map((p, i) => [p.id, i]));
  const period = new Map(dataset.meta.periods.map((p, i) => [p, i]));
  const series: number[] = [];
  for (const f of dataset.series) {
    const m = market.get(f.marketId);
    const p = product.get(f.productId);
    const t = period.get(f.period);
    if (m === undefined || p === undefined || t === undefined) throw new Error(`fact references an unknown market, product or period: ${f.marketId}|${f.productId}|${f.period}`);
    series.push(m, p, t, f.actual, f.forecast, f.units, f.priorYear);
  }
  return { ...dataset, series };
}

export function decodeDataset(wire: WireDataset): Dataset {
  if (wire.series.length % STRIDE !== 0) throw new Error("The dataset arrived malformed.");
  const facts: Fact[] = [];
  for (let i = 0; i < wire.series.length; i += STRIDE) {
    const [m, p, t, actual, forecast, units, priorYear] = wire.series.slice(i, i + STRIDE);
    const market = wire.markets[m ?? -1];
    const product = wire.products[p ?? -1];
    const period = wire.meta.periods[t ?? -1];
    if (!market || !product || period === undefined || actual === undefined || forecast === undefined || units === undefined || priorYear === undefined) {
      throw new Error("The dataset arrived malformed.");
    }
    facts.push({ marketId: market.id, productId: product.id, period, actual, forecast, units, priorYear });
  }
  return { ...wire, series: facts };
}
