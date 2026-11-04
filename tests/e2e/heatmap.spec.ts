import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { gotoReady, shot } from "./helpers";

const heat = (page: Page) => page.getByRole("region", { name: /^Risk heatmap/ });
const cell = (page: Page, market: string, month: string) => heat(page).getByRole("button", { name: new RegExp(`^${market}, ${month}:`) });
const countries = (page: Page) => page.getByRole("button", { name: /Press Enter to open/ });
const h1 = (page: Page) => page.getByRole("heading", { level: 1 });

test("coordinated views: map click -> heatmap cell -> time series marker, radar period, breadcrumb and URL all follow", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await gotoReady(page, "/?compareType=market&compare=de,it,gb");
  await expect(countries(page)).toHaveCount(13);
  await expect(heat(page).getByRole("gridcell")).toHaveCount(13 * 24);

  // 1. Map: pick Germany. The heatmap narrows to Europe's five markets (it does not collapse to one row).
  await page.getByRole("button", { name: /^Germany:/ }).click();
  await expect(page).toHaveURL(/region=eu&market=de/);
  await expect(heat(page).getByRole("gridcell")).toHaveCount(5 * 24);
  await expect(heat(page).getByRole("rowheader")).toHaveCount(5);

  // 2. Heatmap: pick Germany in March 2026.
  await cell(page, "Germany", "Mar 2026").click();
  await expect(page).toHaveURL(/\?region=eu&market=de&period=2026-03&compareType=market&compare=de,it,gb$/);
  await expect(h1(page)).toHaveText("Germany");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByText("Germany")).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("combobox", { name: "Period" })).toHaveValue("2026-03");

  // 3. Time series: the summary and the selected-period marker moved to March 2026.
  await expect(page.getByText(/Germany, Mar 2026:/)).toBeVisible();
  await expect(page.locator(".recharts-reference-line")).toHaveCount(1);
  // 4. Radar: the values follow the same period.
  await expect(page.getByRole("table", { name: /Raw revenue/ }).getByRole("row", { name: /Germany/ })).toContainText("$1,211,930");
  // 5. Map and the selected heat cell reflect the selection.
  await expect(page.getByRole("button", { name: /^Germany:.*selected/ })).toBeVisible();
  await expect(cell(page, "Germany", "Mar 2026")).toHaveAttribute("aria-pressed", "true");
  await expect(heat(page).locator("td[aria-selected='true']")).toHaveCount(1);

  await shot(page, `docs/evidence/P6/coordinated-${testInfo.project.name}.png`, { fullPage: true });

  // Back undoes the heatmap pick, then the map pick.
  await page.goBack();
  await expect(page).not.toHaveURL(/period=2026-03/);
  await page.goBack();
  await expect(h1(page)).toHaveText("Portfolio overview");
  await expect(heat(page).getByRole("gridcell")).toHaveCount(13 * 24);
  expect(errors).toEqual([]);
});

test("keyboard: arrows move through the grid, Enter selects, there is one tab stop", async ({ page }) => {
  await gotoReady(page, "/?region=eu&period=2026-03");
  await expect(heat(page).locator("button[tabindex='0']")).toHaveCount(1);
  await expect(heat(page).locator("button[tabindex='0']")).toHaveAccessibleName(/^Germany, Mar 2026/);

  await cell(page, "Germany", "Mar 2026").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  const focused = page.locator(":focus");
  await expect(focused).toHaveAccessibleName("France, Apr 2026: 97.0% of forecast, 3.0 points under forecast");
  await expect(heat(page).locator("button[tabindex='0']")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?region=eu&market=fr&period=2026-04$/);
  await expect(h1(page)).toHaveText("France");
});

test("the heatmap grid has no axe violations and a visible keyboard focus indicator", async ({ page }, testInfo) => {
  await gotoReady(page, "/?region=eu&market=de&period=2026-03");
  await cell(page, "Germany", "Mar 2026").focus();
  await page.keyboard.press("ArrowRight");
  const outline = await page.locator(":focus").evaluate((el) => {
    const s = getComputedStyle(el);
    return { width: s.outlineWidth, style: s.outlineStyle, shadow: s.boxShadow };
  });
  expect(outline.style).toBe("solid");
  expect(outline.width).toBe("3px");
  expect(outline.shadow).not.toBe("none");
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations).toEqual([]);
  await shot(heat(page), `docs/evidence/P6/heatmap-${testInfo.project.name}.png`);
});

test("on a narrow screen the grid scrolls inside its own container and the page does not overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await gotoReady(page, "/");
  const box = await heat(page).evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(box.scroll).toBeGreaterThan(box.client);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
