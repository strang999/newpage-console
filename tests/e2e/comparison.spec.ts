import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { gotoReady } from "./helpers";

const section = (page: Page) => page.getByRole("region", { name: /^Compare (markets|regions)$/ });
const valuesTable = (page: Page) => page.getByRole("table", { name: /Raw revenue/ });

test("pick three markets: the URL holds them, the radar table shows raw values, reload restores, the period picker updates them", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await gotoReady(page, "/");
  await section(page).getByRole("checkbox", { name: "Germany" }).check();
  await expect(page).not.toHaveURL(/compare/); // one is not a valid comparison, so nothing is written
  await expect(section(page).getByText("1 selected · select at least 2")).toBeVisible();
  await section(page).getByRole("checkbox", { name: "Italy" }).check();
  await expect(page).toHaveURL(/compareType=market&compare=de,it$/);
  await section(page).getByRole("checkbox", { name: "United Kingdom" }).check();
  await expect(page).toHaveURL(/compareType=market&compare=de,it,gb$/);

  const table = valuesTable(page);
  await expect(table.getByRole("row", { name: /Germany/ })).toContainText("$1,676,586");
  await expect(table.getByRole("row", { name: /Italy/ })).toContainText("$940,564");
  await expect(table.getByRole("row", { name: /United Kingdom/ })).toContainText("$2,068,011");
  await expect(page.locator(".recharts-radar-polygon")).toHaveCount(3);

  await page.reload();
  await expect(page).toHaveURL(/compare=de,it,gb$/);
  await expect(section(page).getByRole("checkbox", { name: "Germany" })).toBeChecked();
  await expect(table.getByRole("row", { name: /Germany/ })).toContainText("$1,676,586");

  await page.getByRole("combobox", { name: "Period" }).selectOption("2026-03");
  await expect(table.getByRole("row", { name: /Germany/ })).toContainText("$1,211,930");
  await expect(page).toHaveURL(/\?period=2026-03&compareType=market&compare=de,it,gb$/);

  await page.screenshot({ path: `docs/evidence/P5/comparison-${testInfo.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("regions can be compared, markets and regions are never mixed, and the fourth pick disables the rest", async ({ page }) => {
  await gotoReady(page, "/");
  await section(page).locator("label", { hasText: "Regions" }).click();
  await section(page).getByRole("checkbox", { name: "Europe" }).check();
  await section(page).getByRole("checkbox", { name: "APAC" }).check();
  await expect(page).toHaveURL(/compareType=region&compare=eu,apac$/);
  await expect(valuesTable(page).getByRole("row", { name: /APAC/ })).toContainText("$9,491,556");
  await expect(valuesTable(page).getByRole("row", { name: /APAC/ })).toContainText("position 100/100");

  await section(page).locator("label", { hasText: "Markets" }).click();
  await expect(page).not.toHaveURL(/compare/);
  for (const m of ["United States", "Canada", "Germany", "United Kingdom"]) await section(page).getByRole("checkbox", { name: m }).check();
  await expect(section(page).getByRole("checkbox", { name: "France" })).toBeDisabled();
  await expect(page).toHaveURL(/compare=us,ca,de,gb$/);
});

test("invalid comparison URLs are normalised away; a valid link works without touching the picker", async ({ page }) => {
  await gotoReady(page, "/?compareType=market&compare=de");
  await expect(page).toHaveURL(/\/$/);
  await gotoReady(page, "/?compareType=market&compare=de,eu");
  await expect(page).toHaveURL(/\/$/);
  await gotoReady(page, "/?compareType=region&compare=eu,apac,na");
  await expect(valuesTable(page).locator("tbody tr")).toHaveCount(3);
  await expect(section(page).getByRole("checkbox", { name: "North America" })).toBeChecked();
});

test("back and forward restore the comparison", async ({ page }) => {
  await gotoReady(page, "/");
  await section(page).getByRole("button", { name: /Compare Germany, Italy and the United Kingdom/ }).click();
  await expect(page).toHaveURL(/compare=de,it,gb$/);
  await page.goBack();
  await expect(page).not.toHaveURL(/compare/);
  await expect(section(page).getByRole("checkbox", { name: "Germany" })).not.toBeChecked();
  await page.goForward();
  await expect(valuesTable(page).locator("tbody tr")).toHaveCount(3);
  await expect(section(page).getByRole("checkbox", { name: "Germany" })).toBeChecked();
});

test("the comparison section has no axe violations and the radar keeps a text alternative", async ({ page }) => {
  await gotoReady(page, "/?compareType=market&compare=de,it,gb");
  await expect(page.locator(".recharts-radar-polygon")).toHaveCount(3);
  await expect(page.getByRole("group", { name: /Radar chart comparing Germany, Italy, United Kingdom/ })).toBeVisible();
  await expect(page.getByText("Highest revenue: United Kingdom ($2,068,011); lowest: Italy ($940,564).")).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations).toEqual([]);
});
