import { QueryClient } from "@tanstack/react-query";

export const datasetQueryKey = ["market-dataset"] as const;

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // The dataset is immutable for a deployed build: hydrated once by the server, never refetched.
      queries: { staleTime: Infinity, gcTime: Infinity, retry: false, refetchOnWindowFocus: false },
      // Chat generation and alert writes own their retry policy; Query must not retry them silently.
      mutations: { retry: false },
    },
  });
}
