const LOCALE = "en-US";

const usdCompact = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "USD",
  notation: "compact",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const usdAxis = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const usdExact = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const monthYear = new Intl.DateTimeFormat(LOCALE, { month: "short", year: "numeric", timeZone: "UTC" });

export const NOT_AVAILABLE = "N/A";

/** $22.85M */
export function formatUsdCompact(value: number | null): string {
  return value === null ? NOT_AVAILABLE : usdCompact.format(value);
}

/** $22.9M, short form for chart axes */
export function formatUsdAxis(value: number): string {
  return usdAxis.format(value);
}

/** $22,850,419 */
export function formatUsdExact(value: number | null): string {
  return value === null ? NOT_AVAILABLE : usdExact.format(value).replace("-", "−");
}

export function formatInteger(value: number | null): string {
  return value === null ? NOT_AVAILABLE : integer.format(value);
}

/** One decimal place; `signed` adds an explicit + for positive values. Uses a true minus sign. */
export function formatPercent(value: number | null, options: { signed?: boolean } = {}): string {
  if (value === null || !Number.isFinite(value)) return NOT_AVAILABLE;
  const rounded = Math.round(Math.abs(value) * 10) / 10;
  const body = `${rounded.toFixed(1)}%`;
  if (rounded === 0) return body;
  if (value < 0) return `−${body}`;
  return options.signed ? `+${body}` : body;
}

/** "2026-03" -> "Mar 2026". Parsed as a calendar month in UTC, so the viewer's timezone can never shift it. */
export function formatPeriod(period: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!match) return period;
  return monthYear.format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}
