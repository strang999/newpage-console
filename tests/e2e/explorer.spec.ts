import AxeBuilder from "@axe-core/playwright";
import { gotoReady } from "./helpers";
import { expect, test, type Page } from "@playwright/test";

const children = (page: Page) => page.getByRole("region", { name: /^(Regions|Markets|Products) · select/ });
const h1 = (page: Page) => page.getByRole("heading", { level: 1 });

test("drill three levels, pick a period, reload restores the view, back walks the history", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await gotoReady(page, "/");
  await expect(h1(page)).toHaveText("Portfolio overview");

  await children(page).getByRole("button", { name: "Europe" }).click();
  await expect(page).toHaveURL(/\?region=eu$/);
  await expect(h1(page)).toHaveText("Europe");

  await children(page).getByRole("button", { name: "Germany" }).click();
  await expect(page).toHaveURL(/\?region=eu&market=de$/);
  await expect(h1(page)).toHaveText("Germany");

  await children(page).getByRole("button", { name: "Veltrix" }).click();
  await expect(page).toHaveURL(/\?region=eu&market=de&product=veltrix$/);
  await expect(h1(page)).toHaveText("Germany · Veltrix");

  await page.getByRole("combobox", { name: "Period" }).selectOption("2026-03");
  await expect(page).toHaveURL(/\?region=eu&market=de&product=veltrix&period=2026-03$/);
  await expect(page.getByText(/Germany · Veltrix, Mar 2026:/)).toBeVisible();

  // Shared link: the exact view is restored from the URL alone.
  await page.reload();
  await expect(page).toHaveURL(/period=2026-03$/);
  await expect(h1(page)).toHaveText("Germany · Veltrix");
  await expect(page.getByRole("combobox", { name: "Period" })).toHaveValue("2026-03");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByText("Veltrix")).toHaveAttribute("aria-current", "page");

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({ path: `docs/evidence/P2/explorer-${testInfo.project.name}.png`, fullPage: true });

  // Back walks every discrete selection in reverse.
  await page.goBack();
  await expect(page).toHaveURL(/\?region=eu&market=de&product=veltrix$/);
  await page.goBack();
  await expect(page).toHaveURL(/\?region=eu&market=de$/);
  await expect(h1(page)).toHaveText("Germany");
  await page.goBack();
  await expect(page).toHaveURL(/\?region=eu$/);
  await expect(h1(page)).toHaveText("Europe");
  await page.goBack();
  await expect(h1(page)).toHaveText("Portfolio overview");
  await page.goForward();
  await expect(h1(page)).toHaveText("Europe");

  expect(errors).toEqual([]);
});

test("an invalid URL is normalized with replace, not push", async ({ page }) => {
  await gotoReady(page, "/");
  const before = await page.evaluate(() => history.length);
  await gotoReady(page, "/?market=zz&period=1999-01&utm_source=x");
  await expect(page).toHaveURL(/\/$/);
  await expect(h1(page)).toHaveText("Portfolio overview");
  const after = await page.evaluate(() => history.length);
  expect(after - before).toBe(1);
});

test("breadcrumb and table alternative are keyboard operable", async ({ page }) => {
  await gotoReady(page, "/?region=eu&market=de&period=2026-03");
  const crumb = page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("button", { name: "Europe" });
  await crumb.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?region=eu&period=2026-03$/);

  const tableToggle = page.getByRole("region", { name: "Actual vs forecast vs prior year" }).getByRole("button", { name: "Table" });
  await tableToggle.focus();
  await page.keyboard.press("Space");
  const table = page.getByRole("table", { name: /Monthly actual, forecast and prior-year revenue for Europe/ });
  await expect(table.locator("tbody tr")).toHaveCount(24);
  await expect(table.getByRole("rowheader", { name: "Mar 2026 (selected)" })).toBeVisible();
  const march = table.getByRole("row", { name: /Mar 2026 \(selected\)/ });
  await expect(march.getByRole("cell")).toHaveCount(3);
});

test("the chart renders without animation when the user prefers reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await gotoReady(page, "/?region=eu");
  const actual = page.locator(".recharts-line").first().locator("path.recharts-line-curve");
  await expect(actual).toBeVisible();
  const dash = await actual.evaluate((el) => getComputedStyle(el).strokeDasharray);
  expect(dash).toBe("none");
});
