import type { Page } from "@playwright/test";

/** Navigates and waits until the dashboard has hydrated, so clicks never hit server-rendered, not-yet-interactive markup. */
export async function gotoReady(page: Page, url: string) {
  await page.goto(url);
  await page.locator('[data-hydrated="true"]').waitFor();
}

/** Saves evidence screenshots only when SCREENSHOTS=1, so a normal test run does not rewrite tracked PNGs. */
export async function shot(target: { screenshot: (o: { path: string; fullPage?: boolean }) => Promise<unknown> }, path: string, options: { fullPage?: boolean } = {}) {
  if (process.env.SCREENSHOTS) await target.screenshot({ path, ...options });
}
