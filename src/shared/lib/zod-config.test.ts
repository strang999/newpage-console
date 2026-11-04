import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe("zod stays jitless under the strict CSP", () => {
  const files = sources(join(process.cwd(), "src")).filter((f) => !f.endsWith("zod-config.ts"));
  const users = files.map((f) => ({ f, text: readFileSync(f, "utf8") })).filter(({ text }) => /from "zod"/.test(text));

  it("finds the files that define schemas", () => expect(users.length).toBeGreaterThanOrEqual(5));

  it.each(users.map(({ f }) => f.replace(process.cwd(), "")))("%s imports the config before zod", (file) => {
    const text = users.find(({ f }) => f.endsWith(file.replace(/^[\/]/, "")))?.text ?? "";
    const config = text.indexOf('import "@/shared/lib/zod-config"');
    const zod = text.indexOf('from "zod"');
    expect(config, "zod-config must be imported").toBeGreaterThanOrEqual(0);
    expect(config).toBeLessThan(zod);
  });

  it("the config module turns JIT off", () => {
    const text = readFileSync(join(process.cwd(), "src", "shared", "lib", "zod-config.ts"), "utf8");
    expect(text).toContain("config({ jitless: true })");
  });
});
