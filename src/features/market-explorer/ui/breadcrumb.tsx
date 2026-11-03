import type { Dataset, Scope } from "@/domains/market";
import type { ScopeSelection } from "../types";

type Crumb = { label: string; selection: ScopeSelection };

export function Breadcrumb({ dataset, scope, onSelect }: { dataset: Dataset; scope: Scope; onSelect: (s: ScopeSelection) => void }) {
  const crumbs: Crumb[] = [{ label: "Portfolio", selection: { region: null } }];
  const region = dataset.regions.find((r) => r.id === scope.regionId);
  const market = dataset.markets.find((m) => m.id === scope.marketId);
  const product = dataset.products.find((p) => p.id === scope.productId);
  if (region) crumbs.push({ label: region.name, selection: { region: region.id } });
  if (market) crumbs.push({ label: market.name, selection: { market: market.id } });
  if (market && product) crumbs.push({ label: product.name, selection: { market: market.id, product: product.id } });

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        {crumbs.map((crumb, i) => {
          const current = i === crumbs.length - 1;
          return (
            <li key={crumb.label} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden="true" className="text-muted">/</span>}
              {current ? (
                <span aria-current="page" className="font-semibold">
                  {crumb.label}
                </span>
              ) : (
                <button type="button" onClick={() => onSelect(crumb.selection)} className="rounded-sm px-1 text-[var(--color-accent)] underline underline-offset-2">
                  {crumb.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
