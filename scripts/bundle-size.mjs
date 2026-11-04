// Measures client JavaScript from the real production build: what the first load downloads, and what is deferred.
// Usage: pnpm build && pnpm bundle   (starts `next start` itself, fetches the pages, gzips every chunk)
import { spawn } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync, brotliCompressSync } from "node:zlib";

const PORT = 3950;
const BASE = `http://127.0.0.1:${PORT}`;
const root = process.cwd();
const chunksDir = join(root, ".next", "static", "chunks");

const server = spawn(process.execPath, [join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)], { cwd: root, stdio: "ignore" });
const stop = () => server.kill();
process.on("exit", stop);

async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not start");
}

const size = (buf) => ({ raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length, brotli: brotliCompressSync(buf).length });
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

function scriptsOf(html) {
  return [...new Set([...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map((m) => m[1]))];
}

await waitUp();
const pages = { "/ (executive)": "/", "/?mode=analyst": "/?mode=analyst" };
const result = { measuredAt: new Date().toISOString(), node: process.version, pages: {}, lazy: [] };
const initialSet = new Set();

for (const [label, path] of Object.entries(pages)) {
  const html = await (await fetch(BASE + path)).text();
  const srcs = scriptsOf(html);
  let raw = 0;
  let gzip = 0;
  let brotli = 0;
  for (const src of srcs) {
    const buf = Buffer.from(await (await fetch(BASE + src)).arrayBuffer());
    const s = size(buf);
    raw += s.raw;
    gzip += s.gzip;
    brotli += s.brotli;
    initialSet.add(src.split("?")[0].split("/").pop());
  }
  result.pages[label] = { scripts: srcs.length, raw, gzip, brotli };
}

// Everything else in .next/static/chunks is loaded on demand. Name the ones we know by a marker string.
const markers = [
  ["Fiji", "map geometry + react-simple-maps (lazy: loads with the map)"],
  ["recharts-wrapper", "Recharts (lazy: loads with the first chart)"],
  ["recharts-radar", "Recharts radar (lazy)"],
];
for (const file of readdirSync(chunksDir).filter((f) => f.endsWith(".js"))) {
  if (initialSet.has(file)) continue;
  const buf = readFileSync(join(chunksDir, file));
  const text = buf.toString("utf8");
  const label = markers.find(([m]) => text.includes(m))?.[1] ?? "other lazy chunk";
  const s = size(buf);
  result.lazy.push({ file, label, ...s });
}
result.lazy.sort((a, b) => b.gzip - a.gzip);
stop();

const lines = ["| Page | Scripts | Raw | Gzip | Brotli |", "|---|---|---|---|---|"];
for (const [label, p] of Object.entries(result.pages)) lines.push(`| ${label} | ${p.scripts} | ${kb(p.raw)} | ${kb(p.gzip)} | ${kb(p.brotli)} |`);
lines.push("", "| Deferred chunk | Raw | Gzip |", "|---|---|---|");
for (const c of result.lazy.slice(0, 8)) lines.push(`| ${c.label} (${c.file}) | ${kb(c.raw)} | ${kb(c.gzip)} |`);
console.log(lines.join("\n"));

mkdirSync(join(root, "docs", "performance"), { recursive: true });
writeFileSync(join(root, "docs", "performance", "bundle.json"), JSON.stringify(result, null, 2));
process.exit(0);
