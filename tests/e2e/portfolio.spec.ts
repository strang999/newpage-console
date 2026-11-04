import AxeBuilder from "@axe-core/playwright";
import { gotoReady, shot } from "./helpers";
import { expect, test } from "@playwright/test";

test("portfolio overview shows the verified totals, 13 markets and status text", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await gotoReady(page, "/");
  await expect(page.getByRole("heading", { level: 1, name: "Portfolio overview" })).toBeVisible();

  const kpis = page.getByRole("region", { name: "Portfolio health" });
  await expect(kpis.getByText("$22.85M", { exact: true })).toBeVisible();
  await expect(kpis.getByText("+7.3%", { exact: true })).toBeVisible();
  await expect(kpis.getByText("100.4%", { exact: true })).toBeVisible();
  await expect(kpis.getByText("6", { exact: true })).toBeVisible();

  const table = page.getByRole("table", { name: /by market for/ });
  await expect(table.locator("tbody tr")).toHaveCount(13);
  await expect(table.getByText("On track", { exact: true })).toHaveCount(7);
  await expect(table.getByText("At risk", { exact: true })).toHaveCount(4);
  await expect(table.getByText("Off track", { exact: true })).toHaveCount(2);
  const germany = table.getByRole("row", { name: /Germany/ });
  await expect(germany).toContainText("$1,676,586");
  await expect(germany).toContainText("−9.7%");
  await expect(germany).toContainText("Off track");

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations).toEqual([]);
  expect(errors).toEqual([]);

  await shot(page, `docs/evidence/P1/overview-${testInfo.project.name}.png`, { fullPage: true });
});

test("the table scrolls horizontally inside its own region on a narrow viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "narrow-viewport behaviour");
  await gotoReady(page, "/");
  const region = page.getByRole("region", { name: /All markets/ });
  const { scrollWidth, clientWidth } = await region.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(scrollWidth).toBeGreaterThan(clientWidth);
  const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(pageOverflow).toBeLessThanOrEqual(0);
  await region.focus();
  await expect(region).toBeFocused();
});
