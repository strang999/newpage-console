// Proves `server-only` is enforced: a client component importing a feature's server entry must fail `next build`.
// Creates a temporary route, expects the build to fail with the server-only error, always cleans up.
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dir = join(root, "src", "app", "fixture-server-only");
mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, "page.tsx"),
  `"use client";\nimport { POST } from "@/features/assistant/server";\nexport default function Bad() {\n  return <button onClick={() => void POST}>x</button>;\n}\n`,
);
let code = 1;
try {
  const res = spawnSync("pnpm", ["exec", "next", "build"], { cwd: root, encoding: "utf8", shell: true });
  const out = `${res.stdout}\n${res.stderr}`;
  const failedAsExpected = res.status !== 0 && /depends on "server-only"/.test(out);
  console.log(failedAsExpected ? "OK   client import of server-only module fails next build" : "FAIL build did not reject the server-only import");
  if (!failedAsExpected) console.log(out.slice(-1500));
  code = failedAsExpected ? 0 : 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(join(root, ".next"), { recursive: true, force: true }); // failed build leaves stale route types that break tsc
}
process.exit(code);
