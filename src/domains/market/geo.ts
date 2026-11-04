/**
 * ISO 3166-1 alpha-3 -> numeric id, the key used by the Natural Earth / world-atlas TopoJSON.
 * Covers exactly the markets in the dataset; anything else has no geometry link and renders as "no data".
 */
const ISO3_TO_NUMERIC: Readonly<Record<string, string>> = {
  USA: "840",
  CAN: "124",
  DEU: "276",
  GBR: "826",
  FRA: "250",
  ITA: "380",
  ESP: "724",
  JPN: "392",
  CHN: "156",
  IND: "356",
  AUS: "036",
  BRA: "076",
  MEX: "484",
};

export function numericIdForIso3(iso3: string): string | null {
  return ISO3_TO_NUMERIC[iso3.toUpperCase()] ?? null;
}
