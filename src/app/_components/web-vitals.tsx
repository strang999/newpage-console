"use client";

import { useEffect } from "react";
import type { Metric } from "web-vitals";
import { track } from "@/shared/observability";

function report(metric: Metric) {
  // Name, value, rating and navigation type only: no URL, no element selectors, no attribution.
  track("web_vital", { metric: metric.name, value: metric.value, rating: metric.rating, navigationType: metric.navigationType });
}

/** Field Core Web Vitals through the same allowlisted, content-free pipeline as every other event. Renders nothing. */
export function WebVitals() {
  useEffect(() => {
    // Loaded once the browser is idle, so measuring the page does not compete with painting it. The library observes with
    // `buffered: true`, so metrics that happened before it loaded (paint, LCP, layout shifts) are still reported.
    const start = () => {
      void import("web-vitals").then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
        onCLS(report);
        onINP(report);
        onLCP(report);
        onFCP(report);
        onTTFB(report);
      });
    };
    if (typeof requestIdleCallback === "function") {
      const handle = requestIdleCallback(start, { timeout: 3000 });
      return () => cancelIdleCallback(handle);
    }
    const timer = setTimeout(start, 1000);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
