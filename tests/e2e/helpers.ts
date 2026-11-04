import type { Page } from "@playwright/test";

/** Navigates and waits until the dashboard has hydrated, so clicks never hit server-rendered, not-yet-interactive markup. */
export async function gotoReady(page: Page, url: string, options: { reveal?: boolean } = {}) {
  await page.goto(url);
  await page.locator('[data-hydrated="true"]').waitFor();
  if (options.reveal !== false) await revealLazySurfaces(page);
}

/**
 * Charts and the map mount only when scrolled near (RenderWhenNear), so a phone that never scrolls never downloads them.
 * Tests that exercise those surfaces behave like a user who scrolls through the page once and comes back to the top.
 */
export async function revealLazySurfaces(page: Page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight / 2));
    // Bounded: the page grows as lazy surfaces mount, so a height read once per step could otherwise chase it for long.
    for (let i = 0, y = 0; i < 40 && y <= document.documentElement.scrollHeight; i += 1, y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  });
}

/** Saves evidence screenshots only when SCREENSHOTS=1, so a normal test run does not rewrite tracked PNGs. */
export async function shot(target: { screenshot: (o: { path: string; fullPage?: boolean }) => Promise<unknown> }, path: string, options: { fullPage?: boolean } = {}) {
  if (process.env.SCREENSHOTS) await target.screenshot({ path, ...options });
}
