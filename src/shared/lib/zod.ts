import { z } from "zod";

// Zod would otherwise probe for `eval` (new Function) to JIT-compile schemas the first time one is defined, which a strict
// Content-Security-Policy reports as a violation. Everything validated here is small or validated once, so the interpreted
// path costs nothing and no policy needs 'unsafe-eval'.
//
// Import `z` from here, never from "zod": because this module is evaluated before any importer, the setting is in place
// before the first schema is built, whatever order lazy chunks happen to load in.
z.config({ jitless: true });

export { z };
