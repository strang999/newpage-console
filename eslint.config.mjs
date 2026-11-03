import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "no-restricted-syntax": [
        "error",
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: "Raw HTML rendering is not allowed; render model output as text." },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "next-env.d.ts", "data/starter/**", "playwright-report/**", "test-results/**", "tests/boundaries/**"]),
]);
