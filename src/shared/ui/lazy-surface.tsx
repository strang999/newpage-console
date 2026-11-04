"use client";

import { lazy, Suspense, useState, type ComponentType, type ReactNode } from "react";
import { ErrorBoundary, SurfaceFallback } from "./error-boundary";

/** Resolves to the component itself (not a module record), which lets TypeScript infer the props from the component. */
type Loader<P> = () => Promise<ComponentType<P>>;

/**
 * A lazily loaded component that can be retried. `React.lazy` caches a rejected import for good, so retrying needs a fresh
 * lazy component: `reset()` creates one, and the owner re-renders to pick it up (see `LazySurface`).
 */
export function createRetryableLazy<P>(load: Loader<P>) {
  const make = () => lazy(() => load().then((component) => ({ default: component })));
  let Component = make();
  return {
    get: () => Component,
    reset: () => {
      Component = make();
    },
  };
}

/**
 * Lazy chunk + loading state + failure containment + a working "Try again", in one place. A chunk that fails to load
 * (flaky network, bad deploy) renders the fallback for this surface only; the retry re-requests the chunk.
 */
export function LazySurface<P>({
  surface,
  title,
  handle,
  loadingMinHeight,
  className,
  children,
}: {
  surface: string;
  title: string;
  handle: ReturnType<typeof createRetryableLazy<P>>;
  loadingMinHeight: string;
  /** Class for the element that wraps the loaded surface, e.g. `h-full` when the surface fills its parent. */
  className?: string;
  children: (Component: ComponentType<P>) => ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const Component = handle.get();
  return (
    <ErrorBoundary
      surface={surface}
      fallback={(retry) => (
        <SurfaceFallback
          title={`${title} is unavailable.`}
          detail="The rest of the dashboard is not affected."
          retry={() => {
            handle.reset();
            setAttempt((n) => n + 1);
            retry();
          }}
        />
      )}
    >
      <Suspense
        fallback={
          <div className="card text-sm text-muted" style={{ minHeight: loadingMinHeight }} role="status">
            Loading {title.toLowerCase()}…
          </div>
        }
      >
        <div key={attempt} className={className}>
          {children(Component)}
        </div>
      </Suspense>
    </ErrorBoundary>
  );
}
