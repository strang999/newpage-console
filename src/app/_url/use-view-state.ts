"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { parseViewState, selectInView, serializeViewState, type Dataset, type ViewState } from "@/domains/market";

type Patch = Parameters<typeof selectInView>[1];

/**
 * The one adapter between the URL and the app. The view state is always derived from the query string;
 * nothing is mirrored into component state. Discrete selections push a history entry, normalization replaces.
 */
export function useViewState(dataset: Dataset): { state: ViewState; navigate: (patch: Patch, history?: "push" | "replace") => void } {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const parsed = useMemo(() => parseViewState(searchParams, dataset), [searchParams, dataset]);

  // Selections made before the previous navigation has committed must build on that pending URL, not on the stale render.
  const pending = useRef<{ state: ViewState; canonical: string } | null>(null);
  useEffect(() => {
    pending.current = null;
  }, [searchParams]);

  const hrefFor = useCallback((query: string) => (query ? `${pathname}?${query}` : pathname), [pathname]);

  useEffect(() => {
    if (parsed.needsNormalization) router.replace(hrefFor(parsed.canonical), { scroll: false });
  }, [parsed, router, hrefFor]);

  const navigate = useCallback(
    (patch: Patch, history: "push" | "replace" = "push") => {
      const base = pending.current ?? parsed;
      const next = selectInView(base.state, patch, dataset);
      const query = serializeViewState(next, dataset);
      if (query === base.canonical) return;
      pending.current = { state: next, canonical: query };
      router[history](hrefFor(query), { scroll: false });
    },
    [parsed, dataset, router, hrefFor],
  );

  return { state: parsed.state, navigate };
}
