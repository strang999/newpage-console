"use client";

import { Component, type ReactNode } from "react";
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

/** A plain, accessible fallback line with a retry button. */
export function SurfaceFallback({ title, detail, retry }: { title: string; detail: string; retry: () => void }) {
  return (
    <div role="alert" className="rounded-sm border p-3 text-sm" style={{ borderColor: "var(--color-status-at-risk)", background: "var(--color-status-at-risk-soft)", color: "var(--color-text)" }}>
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5">{detail}</p>
      <button type="button" onClick={retry} className="mt-2 rounded-sm border px-3 py-1 font-medium" style={{ borderColor: "var(--color-status-at-risk)" }}>
        Try again
      </button>
    </div>
  );
}
