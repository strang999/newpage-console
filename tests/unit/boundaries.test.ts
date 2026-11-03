import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const config = join(root, ".dependency-cruiser.cjs");
const cli = join(root, "node_modules", "dependency-cruiser", "bin", "dependency-cruiser.mjs");

function cruise(caseName: string) {
  const cwd = join(root, "tests", "boundaries", caseName);
  const res = spawnSync(process.execPath, [cli, "src", "--config", config, "--output-type", "json"], {
    cwd,
    encoding: "utf8",
  });
  const report = JSON.parse(res.stdout) as {
    summary: { violations: { rule: { name: string; severity: string } }[] };
  };
  return report.summary.violations.filter((v) => v.rule.severity === "error").map((v) => v.rule.name);
}

describe("module boundary rules reject real violations", () => {
  const denied: [string, string][] = [
    ["shared-to-feature", "shared-no-upward"],
    ["domain-to-react", "domain-no-framework"],
    ["sibling-relative", "feature-no-sibling"],
    ["sibling-alias", "feature-no-sibling"],
    ["sibling-reexport", "feature-no-sibling"],
    ["sibling-dynamic", "feature-no-sibling"],
    ["app-to-private", "app-public-entry-only"],
    ["cycle", "no-circular"],
    ["client-to-server", "no-client-to-server"],
    ["feature-to-app", "feature-no-app"],
    ["dotted-name", "feature-no-sibling"], // file named latest.ts must not be mistaken for a test file
  ];
  it.each(denied)("%s fails with %s", (caseName, rule) => {
    expect(cruise(caseName)).toContain(rule);
  });

  it("allows app -> feature public entry, feature -> domain, domain -> shared", () => {
    expect(cruise("allowed")).toEqual([]);
  });
});
