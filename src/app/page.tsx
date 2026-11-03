import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { Dashboard } from "./_components/dashboard";
import { datasetQueryKey, makeQueryClient } from "./_components/query-client";
import { loadDataset } from "./_server/dataset";

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Rendering depends on the query string (shareable view state), so this page is rendered per request.
  await searchParams;
  const queryClient = makeQueryClient();
  queryClient.setQueryData(datasetQueryKey, loadDataset());

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-[1400px] px-4 py-6">
      <HydrationBoundary state={dehydrate(queryClient)}>
        <Dashboard />
      </HydrationBoundary>
    </main>
  );
}
