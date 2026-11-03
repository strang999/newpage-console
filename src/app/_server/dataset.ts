import "server-only";
import raw from "@/data/starter/data.json";
import { datasetSchema, type Dataset } from "@/domains/market";

let cached: Dataset | undefined;

/** The supplied dataset, validated once per server process. A malformed dataset fails loudly here, not in a chart. */
export function loadDataset(): Dataset {
  cached ??= datasetSchema.parse(raw);
  return cached;
}
