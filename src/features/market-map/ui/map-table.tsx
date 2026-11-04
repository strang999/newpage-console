import { STATUS_META, type MapScale, type MarketRow } from "@/domains/market";
import { StatusBadge } from "@/shared/ui/status-badge";

/** The accessible alternative: the same values the map colours, plus status with icon and text, one row per market. */
export function MapTable({
  rows,
  scale,
  selectedMarket,
  periodLabel,
  onSelect,
}: {
  rows: readonly MarketRow[];
  scale: MapScale;
  selectedMarket: string | null;
  periodLabel: string;
  onSelect: (marketId: string) => void;
}) {
  return (
    <div role="region" aria-label="Markets table" tabIndex={0} className="overflow-x-auto rounded-sm border border-border">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <caption className="sr-only">
          {scale.title} by market for {periodLabel}, with the supplied status snapshot
        </caption>
        <thead className="bg-[var(--color-surface-sunken)]">
          <tr>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-muted">
              Market
            </th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-muted">
              Region
            </th>
            <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-muted">
              {scale.title}
            </th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-muted">
              Status*
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = row.market.id === selectedMarket;
            const status = STATUS_META[row.snapshot.status];
            return (
              <tr key={row.market.id} aria-current={selected ? "true" : undefined} className={`border-t border-border ${selected ? "bg-[var(--color-accent-soft)]" : ""}`}>
                <th scope="row" className="px-3 py-1.5 text-left font-normal">
                  <button type="button" onClick={() => onSelect(row.market.id)} className="rounded-sm text-[var(--color-accent)] underline underline-offset-2">
                    {row.market.name}
                  </button>
                  {selected && <span className="ml-1 text-xs text-muted">(selected)</span>}
                </th>
                <td className="px-3 py-1.5 text-muted">{row.regionName}</td>
                <td className="px-3 py-1.5 text-right font-medium tabular-nums">{scale.valueText(row)}</td>
                <td className="px-3 py-1.5">
                  <StatusBadge tone={status.tone} label={status.label} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
