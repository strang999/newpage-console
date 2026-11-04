"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Mounts its children once the placeholder is within `margin` of the viewport and keeps them mounted afterwards. Used
 * for heavy lazy chunks (charts, map) so a phone that never scrolls to them never downloads or runs them.
 * Without IntersectionObserver (old browsers, jsdom) the children render immediately, so nothing is ever withheld.
 */
export function RenderWhenNear({ children, placeholder, margin = "150px" }: { children: ReactNode; placeholder: ReactNode; margin?: string }) {
  const [near, setNear] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = anchor.current;
    if (near || !node) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = setTimeout(() => setNear(true), 0);
      return () => clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { rootMargin: margin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near, margin]);

  if (near) return <>{children}</>;
  return (
    <div ref={anchor} className="h-full w-full">
      {placeholder}
    </div>
  );
}
