"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import type { Dataset } from "@/domains/market";
import type { PaletteSelection } from "./model/items";

// The dialog (search box, list, keyboard handling) is only needed once the palette is opened.
const PaletteDialog = lazy(() => import("./ui/palette-dialog"));

/**
 * Jump to any region, market or product. Opens with Ctrl/Cmd+K or the button; type to filter, arrows to move, Enter to go,
 * Escape to close. A modal dialog with a combobox: focus is trapped while it is open and returns to where it was.
 */
export function CommandPalette({ dataset, onSelect }: { dataset: Dataset; onSelect: (selection: PaletteSelection) => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
        className="inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 text-sm font-medium"
        style={{ borderColor: "var(--color-border-strong)" }}
      >
        Jump to…
        <kbd className="rounded-sm border px-1 text-xs text-muted" style={{ borderColor: "var(--color-border)" }} aria-hidden="true">
          Ctrl K
        </kbd>
      </button>
      {open && (
        <Suspense fallback={null}>
          <PaletteDialog dataset={dataset} onClose={() => setOpen(false)} onSelect={onSelect} />
        </Suspense>
      )}
    </>
  );
}
