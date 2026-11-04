"use client";

import { Component, useEffect, useRef, type ReactNode } from "react";
import { track } from "../observability";

type Props = {
  /** Which surface this guards, e.g. "map". Reported as a code; never the error's message. */
  surface: string;
  /** What to render instead. `retry` clears the error and tries the surface again. */
  fallback: (retry: () => void) => ReactNode;
  children: ReactNode;
};

/**
 * Contains a render or lazy-load failure to one surface so the rest of the dashboard keeps working. The report carries
 * only the surface name and a fixed code: error messages and stacks can contain user data and are not collected.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  // The error and its component stack are deliberately not read: messages can contain user data.
  override componentDidCatch() {
    track("render_error", { surface: this.props.surface, errorCode: "render_error" });
  }

  private retry = () => this.setState({ failed: false });

  override render() {
    return this.state.failed ? this.props.fallback(this.retry) : this.props.children;
  }
}

/** Containers whose fallback is being retried. If the retry fails, the NEW fallback focuses itself when it mounts. */
const retrying = new WeakSet<Element>();

/**
 * After "Try again" the button that had focus is gone. If the retry succeeds, focus returns to the container that held the
 * fallback; if it fails again, the new fallback takes focus when it mounts (see SurfaceFallback). Either way a keyboard or
 * screen-reader user is never dropped on <body>.
 */
function returnFocusToContainer(container: HTMLElement | null) {
  if (!container) return;
  retrying.add(container);
  requestAnimationFrame(() => {
    if (document.activeElement && document.activeElement !== document.body) return; // something already took focus (the new fallback)
    if (!container.hasAttribute("tabindex")) container.setAttribute("tabindex", "-1");
    container.focus({ preventScroll: true });
  });
  // A chunk can take a while to fail again; stop expecting a new fallback after a few seconds.
  setTimeout(() => retrying.delete(container), 5000);
}

/** A plain, accessible fallback line with a retry button. */
export function SurfaceFallback({ title, detail, retry }: { title: string; detail: string; retry: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const parent = box.current?.parentElement;
    if (parent && retrying.has(parent)) {
      retrying.delete(parent);
      box.current?.focus({ preventScroll: true }); // a retry just failed again: put focus on the new explanation
    }
  }, []);

  return (
    <div ref={box} tabIndex={-1} role="alert" className="rounded-sm border p-3 text-sm outline-none" style={{ borderColor: "var(--color-status-at-risk)", background: "var(--color-status-at-risk-soft)", color: "var(--color-text)" }}>
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5">{detail}</p>
      <button
        type="button"
        onClick={(event) => {
          const container = event.currentTarget.closest('[role="alert"]')?.parentElement ?? null;
          retry();
          returnFocusToContainer(container);
        }}
        className="mt-2 rounded-sm border px-3 py-1 font-medium"
        style={{ borderColor: "var(--color-status-at-risk)" }}
      >
        Try again
      </button>
    </div>
  );
}
