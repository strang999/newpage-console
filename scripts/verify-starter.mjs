// Verifies the supplied starter assets are byte-identical to the originals
// recorded in docs/engineering/STARTER-BASELINE.md (SHA-256).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "starter");
const expected = {
  "CONTRACT.md": "9ecdfb7af9030b30ad9b95271195adc3f47ebd3d669f3a2673c0fbbc462e6368",
  "data.json": "b2d93cb48bccd0f38cfc90ecee8f6173dba079914ce8470539a32abe944e8a07",
  "fixtures.json": "932ac1d16db8a068addfb3d7f0e16a6e7b7a833009de7a0df36f077331df2fbc",
  "README.md": "d4638246e11fa7df55e5cfd4dc35d90268927bc9f55e239c66aa334fef14fdef",
  "reference/chat-route.ts": "821fba6323d2458ece6befb01460875c0e88f204272f27fc7492aab5976747b9",
};

let failed = false;
for (const [file, hash] of Object.entries(expected)) {
  const actual = createHash("sha256").update(readFileSync(join(root, file))).digest("hex");
  const ok = actual === hash;
  failed ||= !ok;
  console.log(`${ok ? "OK  " : "FAIL"} ${actual}  ${file}`);
}
process.exit(failed ? 1 : 0);
