import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { gotoReady } from "./helpers";

const palette = (page: Page) => page.getByRole("dialog", { name: /Jump to a region/ });
const axe = (page: Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();

test.describe("command palette (Ctrl+K)", () => {
  test("jump to a product in a market, then back to the portfolio, from the keyboard alone", async ({ page }) => {
    await gotoReady(page, "/");
    await page.keyboard.press("Control+k");
    const box = page.getByRole("combobox", { name: /Search regions/ });
    await expect(box).toBeFocused();
    await box.fill("veltrix japan");
    await expect(palette(page).getByRole("option")).toHaveCount(1);
    expect((await axe(page)).violations).toEqual([]);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/market=jp/);
    await expect(page).toHaveURL(/product=veltrix/);
    await expect(palette(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Japan");

    await page.keyboard.press("Control+k");
    await palette(page).getByRole("combobox").fill("portfolio");
    await page.keyboard.press("Enter");
    await expect(page).not.toHaveURL(/market=/);
    await expect(page.getByRole("heading", { level: 1, name: "Portfolio overview" })).toBeVisible();
  });

  test("the button opens it, arrows move, Escape closes and focus goes back to the button", async ({ page }) => {
    await gotoReady(page, "/");
    const opener = page.getByRole("button", { name: /Jump to/ });
    await opener.click();
    await palette(page).getByRole("combobox").fill("e");
    await page.keyboard.press("ArrowDown");
    const selected = palette(page).getByRole("option", { selected: true });
    await expect(selected).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(palette(page)).toHaveCount(0);
    await expect(opener).toBeFocused();
    await opener.click();
    await palette(page).getByRole("combobox").fill("qqqq");
    await expect(page.getByText(/No region, market or product matches/)).toBeVisible();
  });
});

test.describe("assistant knows the view", () => {
  test("asks in the context of what the dashboard shows, and answers with a citation to exactly that", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "the assistant is a drawer on a phone; the request is the same");
    await gotoReady(page, "/?region=eu&market=de&period=2026-03");
    await expect(page.getByTestId("assistant-context")).toContainText("Germany · Mar 2026");
    await page.getByRole("button", { name: /What am I looking at\?/ }).click();
    const answer = page.getByRole("article", { name: "Assistant answer" }).last();
    await expect(answer.getByText("Answer complete.")).toBeVisible({ timeout: 20_000 });
    await expect(answer).toContainText("You are looking at Germany, Mar 2026");
    await expect(answer).toContainText("AI-generated · verify in evidence");
    await answer.getByRole("button", { name: /Germany · Mar 2026/ }).click();
    await expect(page.getByRole("dialog", { name: /Germany/ })).toContainText("Source: dataset");
  });

  test("the context follows the dashboard: a different market, a different answer", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile");
    await gotoReady(page, "/?region=apac&market=jp");
    await expect(page.getByTestId("assistant-context")).toContainText("Japan");
    await page.getByRole("textbox", { name: "Ask about the data" }).fill("how is this market doing?");
    await page.getByRole("button", { name: "Send" }).click();
    const answer = page.getByRole("article", { name: "Assistant answer" }).last();
    await expect(answer.getByText("Answer complete.")).toBeVisible({ timeout: 20_000 });
    await expect(answer).toContainText("You are looking at Japan");
  });
});

test.describe("virtualised monthly facts table", () => {
  test("1,560 rows, a few dozen in the page; scrolling to the end shows the last rows; sorting restarts at the top", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoReady(page, "/?mode=analyst");
    const region = page.getByRole("region", { name: /Monthly facts table/ });
    await region.scrollIntoViewIfNeeded();
    const table = region.getByRole("table");
    await expect(table).toHaveAttribute("aria-rowcount", "1561");
    const drawn = () => table.locator("tbody tr[aria-rowindex]").count();
    expect(await drawn()).toBeLessThan(40);
    await expect(page.getByTestId("fact-table-range")).toContainText("of 1,560");

    await region.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(page.getByTestId("fact-table-range")).toContainText("1,560");
    await expect(table.locator('tr[aria-rowindex="1561"]')).toBeVisible();
    expect(await drawn()).toBeLessThan(40);

    await table.getByRole("button", { name: "Actual" }).click();
    await expect(table.getByRole("columnheader", { name: "Actual" })).toHaveAttribute("aria-sort", "descending");
    await expect(page.getByTestId("fact-table-range")).toContainText("Rows 1–");
    expect(await region.evaluate((el) => el.scrollTop)).toBe(0);
  });

  test("follows the drill path, and keyboard scrolling works on the focused region", async ({ page }) => {
    await gotoReady(page, "/?mode=analyst&region=eu&market=de");
    const region = page.getByRole("region", { name: /Monthly facts table/ });
    await expect(page.getByRole("heading", { name: /Monthly facts · Germany/ })).toBeVisible();
    await expect(region.getByRole("table")).toHaveAttribute("aria-rowcount", "121");
    await region.focus();
    await page.keyboard.press("End");
    await expect(page.getByTestId("fact-table-range")).toContainText("120");
    expect((await axe(page)).violations).toEqual([]);
  });
});

test.describe("live mode", () => {
  test("figures move, flash and keep the selection, the URL and the sort; turning it off stops them", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoReady(page, "/?mode=analyst&region=apac&market=jp");
    const url = page.url();
    const revenue = page.locator("section[aria-labelledby=health-heading] dl > div").first().locator("dd").first();
    const before = await revenue.innerText();

    const toggle = page.getByRole("switch", { name: /Live/ });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("live-note")).toContainText("Simulated feed");

    await expect.poll(() => revenue.innerText(), { timeout: 15_000 }).not.toBe(before);
    await expect(page.getByTestId("live-note")).toContainText("updated");
    expect(page.url()).toBe(url); // the selection is URL state, which a data update never touches
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Japan");
    expect((await axe(page)).violations).toEqual([]);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(revenue).toHaveText(before); // back to exactly the supplied numbers
    await page.waitForTimeout(3500);
    await expect(revenue).toHaveText(before); // and it stays there
  });

  test("the assistant's evidence keeps showing the supplied data while the dashboard is live", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile");
    test.setTimeout(60_000);
    await gotoReady(page, "/?region=apac&market=jp");
    await page.getByRole("switch", { name: /Live/ }).click();
    await page.getByRole("button", { name: /What am I looking at\?/ }).click();
    const answer = page.getByRole("article", { name: "Assistant answer" }).last();
    await expect(answer.getByText("Answer complete.")).toBeVisible({ timeout: 20_000 });
    await answer.getByRole("button", { name: /Japan/ }).click();
    await expect(page.getByRole("dialog")).toContainText("$2,909,296"); // the supplied May 2026 revenue, not the simulated one
  });
});
