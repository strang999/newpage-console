import type { Dataset } from "@/domains/market";

export type PaletteSelection = { region: string | null; market: string | null; product: string | null };
export type PaletteItem = { id: string; label: string; detail: string; kind: "portfolio" | "region" | "market" | "product"; selection: PaletteSelection };

/** Everything the user can jump to: the portfolio, each region, each market, and each product within each market. */
export function buildPaletteItems(dataset: Dataset): PaletteItem[] {
  const regionName = new Map(dataset.regions.map((r) => [r.id, r.name]));
  const items: PaletteItem[] = [{ id: "portfolio", label: "Portfolio overview", detail: "All products, all markets", kind: "portfolio", selection: { region: null, market: null, product: null } }];
  for (const r of dataset.regions) items.push({ id: `region:${r.id}`, label: r.name, detail: "Region", kind: "region", selection: { region: r.id, market: null, product: null } });
  for (const m of dataset.markets) {
    items.push({ id: `market:${m.id}`, label: m.name, detail: `Market · ${regionName.get(m.regionId) ?? m.regionId}`, kind: "market", selection: { region: m.regionId, market: m.id, product: null } });
  }
  for (const m of dataset.markets) {
    for (const p of dataset.products) {
      items.push({ id: `product:${m.id}:${p.id}`, label: `${p.name} in ${m.name}`, detail: `Product · ${regionName.get(m.regionId) ?? m.regionId}`, kind: "product", selection: { region: m.regionId, market: m.id, product: p.id } });
    }
  }
  return items;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Every word typed must appear in the item's label or detail. Items whose label starts with the first word come first,
 * then the portfolio, regions, markets and products in that order. An empty query lists the portfolio, regions and markets.
 */
export function searchItems(items: readonly PaletteItem[], query: string, limit = 12): PaletteItem[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  const rank = { portfolio: 0, region: 1, market: 2, product: 3 } as const;
  if (words.length === 0) return items.filter((i) => i.kind !== "product").slice(0, limit);
  const first = words[0] ?? "";
  return items
    .map((item) => ({ item, haystack: norm(`${item.label} ${item.detail}`) }))
    .filter(({ haystack }) => words.every((w) => haystack.includes(w)))
    .sort((a, b) => Number(norm(b.item.label).startsWith(first)) - Number(norm(a.item.label).startsWith(first)) || rank[a.item.kind] - rank[b.item.kind])
    .slice(0, limit)
    .map(({ item }) => item);
}
