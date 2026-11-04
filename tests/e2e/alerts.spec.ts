import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { gotoReady, shot } from "./helpers";

const section = (page: Page) => page.getByRole("region", { name: "Alert rules" });
const rows = (page: Page) => section(page).getByTestId("alert-rule");

async function fill(page: Page, name: string, threshold: string) {
  await section(page).getByRole("textbox", { name: "Name" }).fill(name);
  await section(page).getByRole("spinbutton", { name: /Alert when below/ }).fill(threshold);
}

test("a valid rule appears at once as Saving…, is confirmed, survives a reload, and the form resets", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await gotoReady(page, "/?mode=analyst");
  await expect(section(page).getByText(/No rules yet/)).toBeVisible();
  await expect(section(page).getByTestId("persistence-badge")).toHaveText("Saved in this browser only");

  await fill(page, "Europe watch", "95");
  await expect(section(page).getByTestId("alert-preview")).toContainText("Would flag 3 of 13 markets");
  await section(page).getByRole("button", { name: "Save rule" }).click();

  // Optimistic: visible immediately, flagged as pending, save blocked, nothing stored yet.
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toHaveAttribute("data-pending", "true");
  await expect(rows(page).first()).toContainText("Saving…");
  await expect(section(page).getByRole("button", { name: "Saving…" })).toBeDisabled();
  expect(await page.evaluate(() => window.localStorage.getItem("market-console.alert-rules.v1"))).toBeNull();

  // Confirmed after the mock latency.
  await expect(rows(page).first()).not.toHaveAttribute("data-pending", "true", { timeout: 5000 });
  await expect(section(page).getByRole("textbox", { name: "Name" })).toHaveValue("");
  expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem("market-console.alert-rules.v1") ?? "[]").length)).toBe(1);
  await expect(section(page).getByRole("alert")).toHaveCount(0);
  await shot(page, `docs/evidence/P8/alerts-saved-${testInfo.project.name}.png`, { fullPage: true });

  await page.reload();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Europe watch");
  await expect(rows(page).first()).toContainText("Forecast attainment below 95.0% · all 13 markets");
  expect(errors).toEqual([]);
});

test("a rule named 'fail rule' shows up, then rolls back; the draft is kept and a reload shows only committed rules", async ({ page }, testInfo) => {
  await gotoReady(page, "/?mode=analyst");
  await fill(page, "fail rule", "95");
  await section(page).getByRole("button", { name: "Save rule" }).click();

  await expect(rows(page)).toHaveCount(1); // optimistic insert
  await expect(rows(page).first()).toContainText("fail rule");
  await shot(page, `docs/evidence/P8/alerts-pending-${testInfo.project.name}.png`);

  await expect(rows(page)).toHaveCount(0, { timeout: 5000 }); // rolled back within the mock latency
  const alert = section(page).getByRole("alert");
  await expect(alert).toContainText("Couldn't save “fail rule”");
  await expect(alert).toContainText("simulated failure");
  await expect(alert).toContainText("Your draft is kept");
  await expect(section(page).getByRole("textbox", { name: "Name" })).toHaveValue("fail rule");
  await expect(section(page).getByRole("spinbutton", { name: /Alert when below/ })).toHaveValue("95");
  await expect(alert.getByRole("button", { name: "Retry" })).toBeVisible();
  await shot(page, `docs/evidence/P8/alerts-rolled-back-${testInfo.project.name}.png`);

  // Retry fails the same way (the trigger is deterministic), and still nothing is stored.
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toHaveCount(0, { timeout: 5000 });
  await expect(section(page).getByRole("alert")).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem("market-console.alert-rules.v1"))).toBeNull();

  // Fixing the name and saving works, with the draft's other fields intact.
  await section(page).getByRole("textbox", { name: "Name" }).fill("Recovered rule");
  await section(page).getByRole("button", { name: "Save rule" }).click();
  await expect(rows(page).first()).not.toHaveAttribute("data-pending", "true", { timeout: 5000 });
  await expect(section(page).getByRole("alert")).toHaveCount(0);

  await page.reload();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Recovered rule");
  await expect(section(page)).not.toContainText("fail rule");
});

test("an empty threshold is an error, never 0; nothing is sent", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/alerts", (route) => {
    posts += 1;
    return route.continue();
  });
  await gotoReady(page, "/?mode=analyst");
  await section(page).getByRole("textbox", { name: "Name" }).fill("No threshold");
  await section(page).getByRole("button", { name: "Save rule" }).click();
  await expect(section(page).getByText("Enter a threshold")).toBeVisible();
  await expect(section(page).getByRole("spinbutton", { name: /Alert when below/ })).toHaveAttribute("aria-invalid", "true");
  await expect(section(page).getByRole("spinbutton", { name: /Alert when below/ })).toBeFocused();
  expect(posts).toBe(0);
  await expect(rows(page)).toHaveCount(0);
});

test("selected markets need at least one market, then save with exactly those markets", async ({ page }) => {
  await gotoReady(page, "/?mode=analyst");
  await section(page).getByRole("radio", { name: "Selected markets" }).check();
  await fill(page, "Spain and Italy", "100");
  await section(page).getByRole("radio", { name: "YoY growth" }).check();
  await section(page).getByRole("button", { name: "Save rule" }).click();
  await expect(section(page).getByText("Select at least one market")).toBeVisible();
  await section(page).getByRole("checkbox", { name: "Spain" }).check();
  await section(page).getByRole("checkbox", { name: "Italy" }).check();
  await expect(section(page).getByTestId("alert-preview")).toContainText("Would flag 2 of 2 markets");
  await section(page).getByRole("button", { name: "Save rule" }).click();
  await expect(rows(page).first()).not.toHaveAttribute("data-pending", "true", { timeout: 5000 });
  await expect(rows(page).first()).toContainText("YoY growth below 100.0% · Italy, Spain");
});

test("toggle and delete are optimistic and persistent", async ({ page }) => {
  await gotoReady(page, "/?mode=analyst");
  await fill(page, "Europe watch", "95");
  await section(page).getByRole("button", { name: "Save rule" }).click();
  await expect(rows(page).first()).not.toHaveAttribute("data-pending", "true", { timeout: 5000 });

  const toggle = section(page).getByRole("switch", { name: "Europe watch: enabled" });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked(); // instant
  await expect(toggle).toBeDisabled(); // no overlapping writes while it is in flight
  await expect(rows(page).first()).not.toHaveAttribute("data-pending", "true", { timeout: 5000 });
  await page.reload();
  await expect(section(page).getByRole("switch", { name: "Europe watch: enabled" })).not.toBeChecked();
  await expect(rows(page).first()).toContainText("Disabled");

  await section(page).getByRole("button", { name: "Delete Europe watch" }).click();
  await expect(rows(page)).toHaveCount(0); // gone at once
  await expect(section(page).getByText(/No rules yet/)).toBeVisible();
  await page.waitForTimeout(1000);
  await page.reload();
  await expect(rows(page)).toHaveCount(0);
});

test("the alert section has no axe violations, with errors showing and with a rule saved", async ({ page }) => {
  await gotoReady(page, "/?mode=analyst");
  await section(page).getByRole("button", { name: "Save rule" }).click();
  await expect(section(page).getByText("Enter a threshold")).toBeVisible();
  let axe = await new AxeBuilder({ page }).include("section[aria-labelledby]").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations).toEqual([]);

  await fill(page, "fail rule", "95");
  await section(page).getByRole("button", { name: "Save rule" }).click();
  await expect(section(page).getByRole("alert")).toBeVisible({ timeout: 5000 });
  axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations).toEqual([]);
});

test("the form works on a phone: stacked layout, no horizontal overflow, keyboard submit", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await gotoReady(page, "/?mode=analyst");
  await section(page).scrollIntoViewIfNeeded();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await fill(page, "Phone rule", "95");
  await section(page).getByRole("spinbutton", { name: /Alert when below/ }).press("Enter");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).not.toHaveAttribute("data-pending", "true", { timeout: 5000 });
});
