import { expect, test, type Page } from "@playwright/test";
import { gotoReady } from "./helpers";

// Generates the README screenshots. Run with: SCREENSHOTS=1 pnpm e2e --grep "README screenshots"
// Reduced motion is on so every chart is already in its final state when captured.
test.skip(!process.env.SCREENSHOTS, "screenshots are generated on demand");

const out = (name: string) => `docs/screenshots/${name}.png`;
const answer = (page: Page) => page.getByRole("article", { name: "Assistant answer" }).last();

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("README screenshots: executive and analyst, both viewports", async ({ page }, testInfo) => {
  const size = testInfo.project.name;
  await gotoReady(page, "/");
  await expect(page.locator(".recharts-line").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Press Enter to open/ })).toHaveCount(13);
  await page.screenshot({ path: out(`executive-${size}`), fullPage: size === "mobile" });

  await gotoReady(page, "/?mode=analyst&region=eu&market=de&period=2026-03&compareType=market&compare=de,it,gb");
  await expect(page.getByRole("button", { name: /Press Enter to open/ })).toHaveCount(13);
  await expect(page.locator(".recharts-radar-polygon")).toHaveCount(3);
  await expect(page.getByRole("region", { name: /^Risk heatmap/ })).toBeVisible();
  await page.screenshot({ path: out(`analyst-${size}`), fullPage: true });
});

test("README screenshots: the assistant with a citation, evidence and states", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile");
  await gotoReady(page, "/");
  const box = page.getByRole("textbox", { name: "Ask about the data" });

  await box.fill("Why did Germany's revenue dip in March 2026?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(answer(page).getByText("Generating… evidence pending")).toBeVisible();
  await page.screenshot({ path: out("assistant-streaming-desktop") });
  await expect(answer(page).getByText("Answer complete.")).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: out("assistant-answer-desktop") });

  await answer(page).getByRole("button", { name: /Veltrix in Germany, Mar 2026/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: out("assistant-evidence-drawer-desktop") });
  await page.keyboard.press("Escape");

  await box.fill("What will sales look like next year?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("trust-notice").last()).toHaveAttribute("data-kind", "abstain", { timeout: 15_000 });
  await page.locator("#assistant-drawer").screenshot({ path: out("assistant-abstain-desktop") });

  await box.fill("force error");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(answer(page).getByRole("alert")).toBeVisible();
  await page.locator("#assistant-drawer").screenshot({ path: out("assistant-error-desktop") });
});

test("README screenshots: map, heatmap, radar, alerts and a failed surface", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile");
  await gotoReady(page, "/?mode=analyst&metric=status&region=eu&compareType=market&compare=de,it,gb&period=2026-03");
  await expect(page.getByRole("button", { name: /Press Enter to open/ })).toHaveCount(13);
  await page.getByRole("region", { name: "Markets on the map" }).screenshot({ path: out("map-status-desktop") });
  await expect(page.getByRole("region", { name: /^Risk heatmap/ })).toBeVisible();
  await page.getByRole("region", { name: /^Risk heatmap/ }).locator("xpath=..").screenshot({ path: out("heatmap-desktop") });
  await expect(page.locator(".recharts-radar-polygon")).toHaveCount(3);
  await page.getByRole("region", { name: "Compare markets" }).screenshot({ path: out("comparison-radar-desktop") });

  const alerts = page.getByRole("region", { name: "Alert rules" });
  await alerts.getByRole("textbox", { name: "Name" }).fill("fail rule");
  await alerts.getByRole("spinbutton", { name: /Alert when below/ }).fill("95");
  await alerts.getByRole("button", { name: "Save rule" }).click();
  await expect(alerts.getByTestId("alert-rule")).toHaveCount(1);
  await alerts.screenshot({ path: out("alerts-optimistic-desktop") });
  await expect(alerts.getByRole("alert")).toBeVisible({ timeout: 5000 });
  await alerts.screenshot({ path: out("alerts-rolled-back-desktop") });

  await page.route("**/_next/static/chunks/**", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    return body.includes('"Fiji"') ? route.abort("failed") : route.fulfill({ response, body });
  });
  await gotoReady(page, "/?mode=analyst");
  await expect(page.getByRole("region", { name: "Markets on the map" }).getByRole("alert")).toBeVisible();
  await page.getByRole("region", { name: "Markets on the map" }).screenshot({ path: out("map-fallback-desktop") });
});
