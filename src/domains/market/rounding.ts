/**
 * The one-decimal value the UI displays: the magnitude is rounded half up and the sign is kept, exactly like
 * `formatPercent`. (`Math.round(-22.5)` is -22, so rounding the signed value would disagree with the display on
 * negative .x5 ties.) Anything compared "as displayed" (classes, alert thresholds) goes through this one function.
 */
export function displayOneDecimal(value: number): number {
  const rounded = Math.round(Math.abs(value) * 10) / 10;
  return value < 0 && rounded !== 0 ? -rounded : rounded;
}
