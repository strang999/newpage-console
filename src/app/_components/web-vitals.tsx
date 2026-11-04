"use client";

import { useEffect } from "react";
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals";
import { track } from "@/shared/observability";

function report(metric: Metric) {
  // Name, value, rating and navigation type only: no URL, no element selectors, no attribution.
  track("web_vital", { metric: metric.name, value: metric.value, rating: metric.rating, navigationType: metric.navigationType });
}

/** Field Core Web Vitals through the same allowlisted, content-free pipeline as every other event. Renders nothing. */
export function WebVitals() {
  useEffect(() => {
    onCLS(report);
    onINP(report);
    onLCP(report);
    onFCP(report);
    onTTFB(report);
  }, []);
  return null;
}
