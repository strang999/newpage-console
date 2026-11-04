"use client";

import { useEffect } from "react";
import { track } from "@/shared/observability";

/** Last-resort boundary for a route-level failure. Reports a fixed code only, never the error text. */
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    track("render_error", { surface: "route", errorCode: "render_error" });
  }, []);
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-muted">The page could not be shown. Your data is not affected.</p>
      <button type="button" onClick={reset} className="mt-4 rounded-sm px-4 py-2 text-sm font-semibold" style={{ background: "var(--color-accent)", color: "var(--color-accent-contrast)" }}>
        Try again
      </button>
    </main>
  );
}
