/** Module boundary rules from docs/engineering/ARCHITECTURE.md. Run with `pnpm depcruise`. */
const PUBLIC_ENTRY = String.raw`^src/features/[^/]+/(index|client|server)\.tsx?$`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Module cycles are not allowed.",
      from: {},
      to: { circular: true },
    },
    {
      name: "shared-no-upward",
      severity: "error",
      comment: "shared is business-agnostic: it must not import domains, features or app.",
      from: { path: "^src/shared/" },
      to: { path: "^src/(domains|features|app)/" },
    },
    {
      name: "domain-no-framework",
      severity: "error",
      comment: "domains are pure: no React, Next, browser data libraries, features or app.",
      from: { path: "^src/domains/" },
      to: {
        path: ["^src/(features|app)/", "node_modules/(react|react-dom|next|@tanstack/react-query)(/|$)"],
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "feature-no-sibling",
      severity: "error",
      comment: "Features compose through app, never by importing each other (aliases, re-exports and static dynamic imports included).",
      from: { path: "^src/features/([^/]+)/" },
      to: { path: "^src/features/", pathNot: "^src/features/$1/" },
    },
    {
      name: "feature-no-app",
      severity: "error",
      comment: "Features must not import app composition.",
      from: { path: "^src/features/" },
      to: { path: "^src/app/" },
    },
    {
      name: "app-public-entry-only",
      severity: "error",
      comment: "app may import only a feature's public entry (index, client, server).",
      from: { path: "^src/app/" },
      to: { path: "^src/features/", pathNot: PUBLIC_ENTRY },
    },
    {
      name: "no-client-to-server",
      severity: "error",
      comment: "Client entries and client components must not import a feature's server entry.",
      from: { path: String.raw`^src/features/[^/]+/(client\.tsx?|ui/|components/|hooks/)` },
      to: { path: String.raw`^src/features/[^/]+/server\.tsx?$` },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    exclude: { path: String.raw`\.(test|spec)\.tsx?$` },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
