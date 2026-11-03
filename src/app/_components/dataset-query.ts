"use client";

import { useQuery } from "@tanstack/react-query";
import type { Dataset } from "@/domains/market";

import { datasetQueryKey } from "./query-client";

/**
 * The dataset is hydrated into the Query cache by the server page, so this never fetches in practice.
 * If hydration is ever missing the query fails visibly instead of rendering fabricated numbers.
 */
export function useDataset() {
  return useQuery<Dataset>({
    queryKey: datasetQueryKey,
    queryFn: () => Promise.reject(new Error("Dataset was not hydrated by the server.")),
  });
}
