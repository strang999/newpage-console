import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { gotoReady } from "./helpers";

const countries = (page: Page) => page.getByRole("button", { name: /Press Enter to open/ });
const h1 = (page: Page) => page.getByRole("heading", { level: 1 });

test("clicking Germany on the map drills the dashboard into Germany", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await gotoReady(page, "/");
  await expect(countries(page)).toHaveCount(13);
  await page.screenshot({ path: `docs/evidence/P4/map-${testInfo.project.name}.png`, fullPage: true });

  await page.getByRole("button", { name: /^Germany:/ }).click();
  await expect(page).toHaveURL(/\?region=eu&market=de$/);
  await expect(h1(page)).toHaveText("Germany");
  await expect(page.getByRole("button", { name: /^Germany:.*selected/ })).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("keyboard: the 13 countries are focusable in dataset order and Enter drills in", async ({ page }) => {
  await gotoReady(page, "/");
  await expect(countries(page)).toHaveCount(13);
  // Decorative countries must not be tab stops: only the 13 market buttons are focusable inside the map.
  expect(await page.locator("svg.rsm-svg [tabindex='0']").count()).toBe(13);
  expect(await page.locator("svg.rsm-svg path[aria-hidden='true'][tabindex='0']").count()).toBe(0);
  const names = await countries(page).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")?.split(":")[0]));
  expect(names).toEqual(["United States", "Canada", "Germany", "United Kingdom", "France", "Italy", "Spain", "Japan", "China", "India", "Australia", "Brazil", "Mexico"]);

  await countries(page).first().focus();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", /^Canada:/);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", /^Germany:/);
  await expect(page.getByTestId("map-readout")).toContainText("Germany: Revenue $1.68M");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/market=de/);
  await expect(h1(page)).toHaveText("Germany");
});

test("the colour metric lives in the URL and the legend and values follow it", async ({ page }) => {
  await gotoReady(page, "/");
  await page.locator("label", { hasText: "Status" }).click();
  await expect(page).toHaveURL(/\?metric=status$/);
  await expect(page.getByRole("button", { name: /^Germany: Status Off track/ })).toBeVisible();
  await expect(page.getByText("No data", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("radio", { name: "Status" })).toBeChecked();
  await page.locator("label", { hasText: "Growth" }).click();
  await expect(page.getByText("10% and above")).toBeVisible();
  await expect(page.getByRole("button", { name: /^China: Growth vs prior year \+18\.2%/ })).toBeVisible();
});

test("the map follows the period picker, and the table alternative drills too", async ({ page }) => {
  await gotoReady(page, "/?metric=attainment&period=2026-03");
  await expect(page.getByRole("button", { name: /^Germany: Forecast attainment 92\.2%/ })).toBeVisible();
  await page.getByRole("region", { name: "Markets on the map" }).getByRole("button", { name: "Table", exact: true }).click();
  const table = page.getByRole("table", { name: /Forecast attainment by market for Mar 2026/ });
  await expect(table.locator("tbody tr")).toHaveCount(13);
  await expect(table.getByRole("row", { name: /Germany/ })).toContainText("Off track");
  await table.getByRole("button", { name: "Japan" }).click();
  await expect(page).toHaveURL(/market=jp/);
  await expect(page.locator("tr[aria-current='true']")).toContainText("Japan");
});

test("the dashboard with the map has no axe violations", async ({ page }) => {
  await gotoReady(page, "/?metric=growth");
  await expect(countries(page)).toHaveCount(13);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations).toEqual([]);
});
