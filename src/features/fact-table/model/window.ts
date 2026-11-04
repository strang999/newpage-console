export type RowWindow = {
  /** First row to render (inclusive). */
  start: number;
  /** One past the last row to render. */
  end: number;
  /** Height of the space standing in for the rows above / below the window. */
  before: number;
  after: number;
};

/**
 * Which rows of a fixed-row-height list need to exist for a scroll position: those in view plus `overscan` on each side,
 * so a fast scroll never shows an empty gap. Everything else is a spacer of the right height, so the scrollbar and the
 * scroll positions are those of the full list.
 */
export function computeWindow({ scrollTop, viewportHeight, rowHeight, total, overscan }: { scrollTop: number; viewportHeight: number; rowHeight: number; total: number; overscan: number }): RowWindow {
  if (total <= 0 || rowHeight <= 0) return { start: 0, end: 0, before: 0, after: 0 };
  const top = Math.max(0, scrollTop);
  const first = Math.floor(top / rowHeight);
  const last = Math.ceil((top + viewportHeight) / rowHeight);
  const start = Math.min(Math.max(0, first - overscan), total - 1);
  const end = Math.min(total, Math.max(start + 1, last + overscan));
  return { start, end, before: start * rowHeight, after: (total - end) * rowHeight };
}
