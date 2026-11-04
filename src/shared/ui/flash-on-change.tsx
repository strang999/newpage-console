"use client";

import { useState, type ReactNode } from "react";

/**
 * Wraps a displayed figure and plays a short background flash when its underlying `value` changes (never on first render),
 * tinted by direction. The flash is decoration: the figure is plain text either way, and reduced motion removes the animation.
 */
export function FlashOnChange({ value, children }: { value: number | null; children: ReactNode }) {
  const [seen, setSeen] = useState(value);
  const [direction, setDirection] = useState<"up" | "down" | null>(null);
  if (value !== seen) {
    // Derived during render (React's "adjust state when a prop changes" pattern), so there is no extra render pass.
    setSeen(value);
    setDirection(value !== null && seen !== null ? (value > seen ? "up" : "down") : null);
  }
  // The key restarts the CSS animation each time the value changes, and only then.
  return (
    <span key={`${value}`} data-flash={direction ?? undefined} className="live-flash rounded-sm">
      {children}
    </span>
  );
}
