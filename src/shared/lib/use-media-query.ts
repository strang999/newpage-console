"use client";

import { useSyncExternalStore } from "react";

/** Subscribes to a CSS media query. The server snapshot is `false`, so first paint assumes the narrow layout. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
