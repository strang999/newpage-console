import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { encodeDataset } from "@/domains/market";
import { Dashboard } from "./_components/dashboard";
import { datasetQueryKey, makeQueryClient } from "./_components/query-client";
import { loadDataset } from "./_server/dataset";

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Rendering depends on the query string (shareable view state), so this page is rendered per request.
  await searchParams;
  const queryClient = makeQueryClient();
  // Sent in the compact wire form: the facts are most of the document, and the document is on the critical path of the first paint.
  queryClient.setQueryData(datasetQueryKey, encodeDataset(loadDataset()));

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-[1400px] px-4 pb-24 pt-6 xl:pb-6">
      <HydrationBoundary state={dehydrate(queryClient)}>
        <Dashboard />
      </HydrationBoundary>
    </main>
  );
}
