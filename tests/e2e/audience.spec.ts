import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { gotoReady, shot } from "./helpers";

const h1 = (page: Page) => page.getByRole("heading", { level: 1 });
const health = (page: Page) => page.getByRole("region", { name: "Portfolio health" });
const analystOnly = (page: Page) => ({
  heatmap: page.getByRole("region", { name: /^Risk heatmap/ }),
  comparison: page.getByRole("region", { name: /^Compare (markets|regions)$/ }),
  denseTable: page.getByRole("table", { name: /Column headings are buttons that sort the table/ }),
});

test("executive is the default: health, trend, top risks, top movers and the map, with the analyst surfaces absent", async ({ page }, testInfo) => {
  await gotoReady(page, "/");
  await expect(page.locator("[data-mode]")).toHaveAttribute("data-mode", "executive");
  await expect(h1(page)).toHaveText("Portfolio overview");
  await expect(page.getByRole("radio", { name: "Executive" })).toBeChecked();

  await expect(health(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Actual vs forecast vs prior year" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Top risks" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Top movers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Markets on the map" })).toBeVisible();

  const a = analystOnly(page);
  await expect(a.heatmap).toHaveCount(0);
  await expect(a.comparison).toHaveCount(0);
  await expect(a.denseTable).toHaveCount(0);
  await expect(page.getByRole("region", { name: /^Regions · select one/ })).toHaveCount(0);
  await shot(page, `docs/evidence/P7/executive-${testInfo.project.name}.png`, { fullPage: true });
});

test("executive keeps the headline minimal: at most 8 numbers in the health strip, and it sits above the fold", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "the fold on a phone is a different, narrower claim");
  await gotoReady(page, "/");
  const values = health(page).locator("dd.text-3xl");
  expect(await values.count()).toBeLessThanOrEqual(8);
  expect(await values.count()).toBe(4);
  const viewport = page.viewportSize();
  const box = await health(page).boundingBox();
  expect(box && viewport && box.y + box.height).toBeLessThanOrEqual(viewport?.height ?? 0);
});

test("top risks lists the flagged markets most severe first with status text, attainment and gap; clicking one drills in", async ({ page }) => {
  await gotoReady(page, "/");
  const risks = page.getByRole("region", { name: "Top risks" });
  const names = await risks.locator("li button").allTextContents();
  expect(names).toEqual(["Germany", "Spain", "Italy", "United Kingdom", "Brazil"]);
  await expect(risks.locator("li").first()).toContainText("Off track");
  await expect(risks.locator("li").first()).toContainText("92.2% of forecast");
  await expect(risks.locator("li").first()).toContainText("$141,058 under");
  await expect(risks.locator("li").nth(1)).toContainText("104.7% of forecast"); // Spain: off track although above forecast, shown as supplied
  await expect(risks).toContainText("supplied snapshot (May 2026)");

  const movers = page.getByRole("region", { name: "Top movers" });
  expect(await movers.locator("li button").allTextContents()).toEqual(["China", "United States", "Japan", "Germany", "France"]); // by |YoY revenue change|, from the audit
  await expect(movers.locator("li").nth(3)).toContainText("Down"); // Germany fell; direction is text, not only colour
  await expect(movers.locator("li").nth(3)).toContainText("−$180,651");

  await risks.getByRole("button", { name: "Italy" }).click();
  await expect(page).toHaveURL(/\?region=eu&market=it$/);
  await expect(h1(page)).toHaveText("Italy");
});

test("switching audience keeps every selection and puts the mode in the URL", async ({ page }) => {
  await gotoReady(page, "/?region=eu&market=de&period=2026-03&metric=growth");
  await page.locator("label", { hasText: "Analyst" }).click();
  await expect(page).toHaveURL(/\?mode=analyst&region=eu&market=de&period=2026-03&metric=growth$/);
  await expect(h1(page)).toHaveText("Germany");
  await expect(page.getByRole("combobox", { name: "Period" })).toHaveValue("2026-03");
  const a = analystOnly(page);
  await expect(a.heatmap).toBeVisible();
  await expect(a.comparison).toBeVisible();
  await expect(a.denseTable).toBeVisible();
  await expect(page.getByRole("radio", { name: "Growth", exact: true })).toBeChecked();

  await page.locator("label", { hasText: "Executive" }).click();
  await expect(page).toHaveURL(/\?region=eu&market=de&period=2026-03&metric=growth$/);
  await expect(page.getByRole("heading", { name: "Top risks" })).toBeVisible();
  await expect(a.heatmap).toHaveCount(0);

  // Each audience switch is a history entry: Back returns to the previous audience with the selection intact.
  await page.goBack();
  await expect(page).toHaveURL(/\?mode=analyst&region=eu&market=de&period=2026-03&metric=growth$/);
  await expect(page.getByRole("radio", { name: "Analyst" })).toBeChecked();
  await expect(a.denseTable).toBeVisible();

  // The audience is part of a shareable link.
  await gotoReady(page, "/?mode=analyst&region=eu");
  await expect(page.getByRole("radio", { name: "Analyst" })).toBeChecked();
  await expect(a.denseTable).toBeVisible();
});

test("analyst: the dense table shows every metric and sorts from the keyboard", async ({ page }) => {
  await gotoReady(page, "/?mode=analyst");
  const table = page.getByRole("table", { name: /Column headings are buttons that sort the table/ });
  await expect(table.getByRole("columnheader")).toHaveCount(11);
  await expect(table.locator("tbody tr")).toHaveCount(13);

  const first = async () => (await table.locator("tbody tr").first().getByRole("rowheader").textContent())?.trim();
  expect(await first()).toBe("United States");
  await table.getByRole("button", { name: "Revenue" }).focus();
  await page.keyboard.press("Enter");
  expect(await first()).toBe("China");
  await expect(table.getByRole("columnheader", { name: "Revenue" })).toHaveAttribute("aria-sort", "descending");
  await page.keyboard.press("Enter");
  expect(await first()).toBe("Spain");
  await expect(table.getByRole("columnheader", { name: "Revenue" })).toHaveAttribute("aria-sort", "ascending");

  await table.getByRole("button", { name: "Open Japan and its products" }).click();
  await expect(page).toHaveURL(/\?mode=analyst&region=apac&market=jp$/);
});

test("both audiences pass axe and have no console errors", async ({ page }) => {
  test.setTimeout(60_000); // three full page loads, each scrolled through once and scanned by axe
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  for (const url of ["/", "/?mode=analyst", "/?mode=analyst&region=eu&market=de&compareType=market&compare=de,it,gb"]) {
    await gotoReady(page, url);
    await expect(page.getByRole("heading", { name: "Markets on the map" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Press Enter to open/ })).toHaveCount(13);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(axe.violations, url).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test("phone: both audiences stack without horizontal overflow, and the assistant is a drawer", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  for (const url of ["/", "/?mode=analyst"]) {
    await gotoReady(page, url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, url).toBeLessThanOrEqual(0);
  }
  await gotoReady(page, "/");
  await expect(page.getByRole("heading", { name: "Assistant", level: 2 })).toBeHidden(); // closed: not in the layout or the a11y tree
  const opener = page.getByRole("button", { name: "Ask the assistant" });
  await expect(opener).toHaveAttribute("aria-expanded", "false");
  await opener.click();
  await expect(opener).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("heading", { name: "Assistant", level: 2 })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Ask about the data" })).toBeVisible();
  await shot(page, `docs/evidence/P7/assistant-drawer-${testInfo.project.name}.png`);
});

test("phone: the drawer keeps the conversation (even a running answer) across close and reopen; Escape closes and returns focus", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await gotoReady(page, "/");
  const opener = page.getByRole("button", { name: "Ask the assistant" });
  await opener.click();
  await page.getByRole("button", { name: /Why did Germany's revenue dip/ }).click();
  await expect(page.getByRole("article", { name: "Assistant answer" }).getByText("Generating… evidence pending")).toBeVisible();

  await page.getByRole("button", { name: "Close assistant" }).click(); // close mid-answer
  await expect(page.getByRole("heading", { name: "Assistant", level: 2 })).toBeHidden();
  await expect(opener).toBeFocused();

  await opener.click();
  const answer = page.getByRole("article", { name: "Assistant answer" });
  await expect(answer.getByText("Answer complete.")).toBeVisible({ timeout: 15_000 }); // the generation kept running
  await expect(answer.getByText("Germany's revenue fell sharply in March 2026")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Assistant", level: 2 })).toBeHidden();
  await expect(opener).toBeFocused();
});

test("phone: 'Open in dashboard' from the evidence drawer closes the assistant so the change is visible", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await gotoReady(page, "/");
  await page.getByRole("button", { name: "Ask the assistant" }).click();
  await page.getByRole("button", { name: /Why did Germany's revenue dip/ }).click();
  const answer = page.getByRole("article", { name: "Assistant answer" });
  await expect(answer.getByText("Answer complete.")).toBeVisible({ timeout: 20_000 });
  await answer.getByRole("button", { name: /Veltrix in Germany, Mar 2026/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Open in dashboard" }).click();
  await expect(page).toHaveURL(/\?region=eu&market=de&product=veltrix&period=2026-03$/);
  await expect(page.getByRole("heading", { name: "Assistant", level: 2 })).toBeHidden();
  await expect(h1(page)).toHaveText("Germany · Veltrix");
});

test("phone: the open drawer is a real modal: named dialog, page behind inert and not scrollable, Tab stays inside", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await gotoReady(page, "/");
  await page.getByRole("button", { name: "Ask the assistant" }).click();
  const drawer = page.getByRole("dialog", { name: "Assistant" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute("aria-modal", "true");
  await expect(page.locator("[data-mode] > div").first()).toHaveAttribute("inert", "");
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe("hidden");
  // Tab never lands on the page behind the drawer. (Past the last control the browser may move focus to its own chrome,
  // which shows up as <body>; what must never happen is focus inside the dashboard column.)
  const reachedDashboard: number[] = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => !!document.activeElement?.closest("[data-mode] > div:first-child"))) reachedDashboard.push(i);
  }
  expect(reachedDashboard).toEqual([]);
  expect(await page.evaluate(() => !!document.activeElement?.closest("#assistant-drawer") || document.activeElement === document.body)).toBe(true);
  await page.getByRole("button", { name: "Close assistant" }).click();
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe("hidden");
  await expect(page.locator("[data-mode] > div").first()).not.toHaveAttribute("inert", "");
});

test("phone: Escape inside the evidence dialog closes only the dialog; the drawer closes on the next Escape", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await gotoReady(page, "/");
  await page.getByRole("button", { name: "Ask the assistant" }).click();
  await page.getByRole("button", { name: /Why did Germany's revenue dip/ }).click();
  const answer = page.getByRole("article", { name: "Assistant answer" });
  await expect(answer.getByText("Answer complete.")).toBeVisible({ timeout: 20_000 });
  await answer.getByRole("button", { name: /Veltrix in Germany, Mar 2026/ }).click();
  const evidence = page.getByRole("dialog", { name: "Germany · Veltrix · Mar 2026" });
  await expect(evidence).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(evidence).toBeHidden();
  await expect(page.getByRole("dialog", { name: "Assistant" })).toBeVisible(); // the drawer is still open
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Assistant" })).toBeHidden();
});

test("opening the drawer on a phone and growing to desktop gives the normal side column, not a stretched panel", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await gotoReady(page, "/");
  await page.getByRole("button", { name: "Ask the assistant" }).click();
  await expect(page.getByRole("dialog", { name: "Assistant" })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("dialog", { name: "Assistant" })).toHaveCount(0);
  const panel = page.locator("#assistant-drawer");
  await expect(panel).toBeVisible();
  const style = await panel.evaluate((el) => ({ position: getComputedStyle(el).position, height: el.getBoundingClientRect().height }));
  expect(style.position).toBe("sticky");
  expect(style.height).toBeLessThan(900);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#assistant-drawer")).toBeHidden(); // narrowing again does not pop the drawer open
});

test("phone: the floating assistant button never covers the end of the page", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await gotoReady(page, "/?mode=analyst");
  const bottomGap = await page.evaluate(() => {
    const main = document.querySelector("main");
    return main ? parseFloat(getComputedStyle(main).paddingBottom) : 0;
  });
  expect(bottomGap).toBeGreaterThanOrEqual(80);
});
