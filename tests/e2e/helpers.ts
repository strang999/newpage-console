import type { Page } from "@playwright/test";

/** Navigates and waits until the dashboard has hydrated, so clicks never hit server-rendered, not-yet-interactive markup. */
export async function gotoReady(page: Page, url: string) {
  await page.goto(url);
  await page.locator('[data-hydrated="true"]').waitFor();
}
