import "@testing-library/jest-dom/vitest";

// jsdom has no matchMedia; default to "no reduced-motion preference".
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

// Lazy chunks (map, charts) compile on first use; under a loaded parallel run that can exceed the 1 s default.
if (typeof window !== "undefined") {
  const { configure } = await import("@testing-library/react");
  configure({ asyncUtilTimeout: 5000 });
}

// Conversations are stored in sessionStorage; never let one test restore another's.
if (typeof window !== "undefined") {
  const { afterEach } = await import("vitest");
  afterEach(() => window.sessionStorage.clear());
}
