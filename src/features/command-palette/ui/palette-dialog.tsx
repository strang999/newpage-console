"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Dataset } from "@/domains/market";
import { buildPaletteItems, searchItems, type PaletteSelection } from "../model/items";

/** Closes via the native dialog API when it exists; otherwise (older engines, jsdom) mimic it, including the close event. */
function closeDialog(el: HTMLDialogElement | null) {
  if (!el) return;
  if (typeof el.close === "function") el.close();
  else {
    el.removeAttribute("open");
    el.dispatchEvent(new Event("close"));
  }
}

export default function PaletteDialog({ dataset, onClose, onSelect }: { dataset: Dataset; onClose: () => void; onSelect: (selection: PaletteSelection) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const items = useMemo(() => buildPaletteItems(dataset), [dataset]);
  const results = useMemo(() => searchItems(items, query), [items, query]);
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));

  useEffect(() => {
    const el = dialog.current;
    if (!el || el.open) return;
    if (typeof el.showModal === "function") el.showModal();
    else el.setAttribute("open", "");
    input.current?.focus(); // autoFocus does not fire for an element inside a closed dialog
  }, []);

  useEffect(() => {
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, listId]);

  function choose(index: number) {
    const item = results[index];
    if (!item) return;
    onSelect(item.selection);
    closeDialog(dialog.current);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(results.length ? (activeIndex + 1) % results.length : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(results.length ? (activeIndex - 1 + results.length) % results.length : 0);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(Math.max(results.length - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(activeIndex);
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-label="Jump to a region, market or product"
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && closeDialog(dialog.current)}
      className="fixed left-1/2 top-[12vh] m-0 w-[min(34rem,calc(100vw-2rem))] max-w-none -translate-x-1/2 rounded-md border border-border bg-surface p-0 text-[var(--color-text)] shadow-2xl backdrop:bg-black/40"
    >
      <div className="p-3">
        <input
          ref={input}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results.length ? `${listId}-${activeIndex}` : undefined}
          aria-label="Search regions, markets and products"
          placeholder="Search: Germany, Veltrix, Europe…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="w-full rounded-sm border bg-surface px-3 py-2 text-base"
          style={{ borderColor: "var(--color-border-strong)" }}
        />
        <ul id={listId} role="listbox" aria-label="Results" className="mt-2 max-h-[50vh] overflow-y-auto">
          {results.map((item, i) => (
            <li
              key={item.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseMove={() => setActive(i)}
              onClick={() => choose(i)}
              className={`flex cursor-pointer items-baseline justify-between gap-3 rounded-sm px-3 py-2 text-sm ${i === activeIndex ? "bg-[var(--color-accent-soft)] font-semibold" : ""}`}
            >
              <span>{item.label}</span>
              <span className="text-xs font-normal text-muted">{item.detail}</span>
            </li>
          ))}
        </ul>
        {results.length === 0 && <p className="px-3 py-2 text-sm text-muted">No region, market or product matches “{query}”.</p>}
        <p role="status" aria-live="polite" className="sr-only">
          {results.length === 0 ? "No results" : `${results.length} result${results.length === 1 ? "" : "s"}`}
        </p>
        <p className="mt-2 px-1 text-xs text-muted" aria-hidden="true">
          ↑ ↓ to move · Enter to go · Esc to close
        </p>
      </div>
    </dialog>
  );
}
