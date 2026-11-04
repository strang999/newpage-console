import { config } from "zod";

// Zod would otherwise probe for `eval` (new Function) to JIT-compile schemas the first time one is defined, which a strict
// Content-Security-Policy reports as a violation. Everything validated here is small or validated once, so the interpreted
// path costs nothing and no policy needs 'unsafe-eval'.
//
// This module only has a side effect. Every source file that imports "zod" imports it FIRST (a test enforces that), so the
// setting is in place before any schema is defined, whatever order lazy chunks load in. It is deliberately not a
// re-export of `z`: re-exporting the namespace defeats tree-shaking (+59 KB gzip, measured).
config({ jitless: true });
