// WCAG 2.x contrast check for the token pairs documented in docs/design.md.
// Reads tokens.css so the numbers cannot drift from the real values.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/shared/styles/tokens.css", import.meta.url), "utf8");
const t = Object.fromEntries([...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(t[a]), lum(t[b])].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const pairs = [
  ["color-text", "color-canvas", 4.5],
  ["color-text", "color-surface", 4.5],
  ["color-text-muted", "color-surface", 4.5],
  ["color-text-muted", "color-canvas", 4.5],
  ["color-text-muted", "color-surface-sunken", 4.5],
  ["color-accent", "color-surface", 4.5],
  ["color-accent-contrast", "color-accent", 4.5],
  ["color-accent", "color-accent-soft", 4.5],
  ["color-ai-text", "color-ai-surface", 4.5],
  ["color-status-on-track", "color-status-on-track-soft", 4.5],
  ["color-status-at-risk", "color-status-at-risk-soft", 4.5],
  ["color-status-off-track", "color-status-off-track-soft", 4.5],
  ["color-status-neutral", "color-status-neutral-soft", 4.5],
  // text on the diverging scale cells (heatmap): white on the dark ends, dark text on the light classes
  ["color-surface", "scale-div-0", 4.5],
  ["color-surface", "scale-div-4", 4.5],
  ["color-text", "scale-div-1", 4.5],
  ["color-text", "scale-div-2", 4.5],
  ["color-text", "scale-div-3", 4.5],
  ["color-border-strong", "color-surface", 3],
  ["color-ai-border", "color-surface", 3],
  ["color-focus", "color-surface", 3],
];

let failed = false;
const rows = pairs.map(([fg, bg, min]) => {
  const r = ratio(fg, bg);
  const ok = r >= min;
  failed ||= !ok;
  return `| ${fg} | ${bg} | ${r.toFixed(2)}:1 | ${min}:1 | ${ok ? "pass" : "FAIL"} |`;
});
console.log(["| Foreground | Background | Ratio | Needed | Result |", "|---|---|---|---|---|", ...rows].join("\n"));
process.exit(failed ? 1 : 0);
