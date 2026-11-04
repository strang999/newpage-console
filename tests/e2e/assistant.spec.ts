import AxeBuilder from "@axe-core/playwright";
import { gotoReady, shot } from "./helpers";
import { expect, test } from "@playwright/test";

const composer = (page: import("@playwright/test").Page) => page.getByRole("textbox", { name: "Ask about the data" });
const answer = (page: import("@playwright/test").Page) => page.getByRole("article", { name: "Assistant answer" }).last();

test("a streamed answer grows incrementally, shows pending evidence, then completes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "layout covered in P7; stream behaviour is viewport independent");
  await gotoReady(page, "/");
  await composer(page).fill("Why did Germany's revenue dip in March 2026?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(answer(page).getByText("Generating… evidence pending")).toBeVisible();
  const lengthOf = async () => (await answer(page).locator("p.whitespace-pre-wrap").first().textContent())?.length ?? 0;
  await expect.poll(lengthOf, { timeout: 5000 }).toBeGreaterThan(5);
  const first = await lengthOf();
  await expect.poll(lengthOf, { timeout: 5000 }).toBeGreaterThan(first);

  await expect(answer(page).getByText("Answer complete.")).toBeVisible({ timeout: 15_000 });
  await expect(answer(page).getByText("Generating… evidence pending")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Answer complete." })).toHaveCount(1);

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations).toEqual([]);
  await shot(page, `docs/evidence/P3/assistant-complete-${testInfo.project.name}.png`);
});

test("Stop mid-answer keeps the partial text and labels evidence unavailable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile");
  await gotoReady(page, "/");
  await composer(page).fill("Give me a full portfolio summary");
  await page.getByRole("button", { name: "Send" }).click();
  const text = answer(page).locator("p.whitespace-pre-wrap").first();
  await expect.poll(async () => (await text.textContent())?.length ?? 0).toBeGreaterThan(10);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(answer(page).getByText(/Stopped\. Evidence is unavailable/)).toBeVisible();
  const frozen = (await text.textContent()) ?? "";
  expect(frozen.length).toBeGreaterThan(10);
  await page.waitForTimeout(600);
  expect(await text.textContent()).toBe(frozen);
  await expect(page.getByRole("button", { name: "Retry from the beginning" })).toBeVisible();
});

test("the supplied error fixture shows an error with retry, and the dashboard stays usable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile");
  await gotoReady(page, "/?mode=analyst");
  await composer(page).fill("force error");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(answer(page).getByRole("alert")).toBeVisible();
  await expect(answer(page).getByRole("button", { name: "Retry from the beginning" })).toBeVisible();
  await page.getByRole("region", { name: /^Regions/ }).getByRole("button", { name: "Europe" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Europe");
});

test("when /api/chat is down the dashboard works and the chat shows a failure with retry", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile");
  await page.route("**/api/chat", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await gotoReady(page, "/?mode=analyst");
  await composer(page).fill("germany");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(answer(page).getByRole("alert")).toContainText("HTTP 503");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Portfolio overview");
  await expect(page.getByRole("table", { name: /by market for/ }).locator("tbody tr")).toHaveCount(13);
});

test("'Germany next year' abstains instead of answering about Germany", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile");
  await gotoReady(page, "/");
  await composer(page).fill("Germany next year");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(answer(page).getByText("Answer complete.")).toBeVisible({ timeout: 15_000 });
  await expect(answer(page)).toContainText(/can't|cannot|beyond|not able|only/i);
});

test("transient 503s are retried automatically and the answer is not duplicated", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile");
  let calls = 0;
  await page.route("**/api/chat", (route) => {
    calls += 1;
    return calls <= 2 ? route.fulfill({ status: 503, body: "busy" }) : route.continue();
  });
  await gotoReady(page, "/");
  await composer(page).fill("Why did Germany's revenue dip in March 2026?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(answer(page).getByText(/Retrying automatically/)).toBeVisible();
  await expect(answer(page).getByText("Answer complete.")).toBeVisible({ timeout: 20_000 });
  expect(calls).toBe(3);
  const text = (await answer(page).locator("p.whitespace-pre-wrap").first().textContent()) ?? "";
  expect(text.match(/Germany's revenue fell/g)).toHaveLength(1);
});

test("Stop during the retry backoff ends the generation and sends no more requests", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile");
  let calls = 0;
  await page.route("**/api/chat", (route) => {
    calls += 1;
    return route.fulfill({ status: 503, body: "busy" });
  });
  await gotoReady(page, "/");
  await composer(page).fill("germany");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(answer(page).getByText(/Retrying automatically/)).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(answer(page).getByText(/Stopped\./)).toBeVisible();
  await page.waitForTimeout(2500);
  expect(calls).toBe(1);
});

test("an oversized question is rejected by the route with a 400 message", async ({ request, baseURL }) => {
  const res = await request.post(`${baseURL}/api/chat`, { data: { question: "x".repeat(600) } });
  expect(res.status()).toBe(400);
  expect(await res.json()).toEqual({ error: expect.stringContaining("too long") });
});

test("answer -> confidence -> citation -> evidence drawer -> open in dashboard sets the URL", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile");
  await gotoReady(page, "/");
  await composer(page).fill("Why did Germany's revenue dip in March 2026?");
  await page.getByRole("button", { name: "Send" }).click();

  // Nothing about confidence or evidence exists until the stream is done.
  await expect(answer(page).getByText("Generating… evidence pending")).toBeVisible();
  await expect(page.getByTestId("trust-notice")).toHaveCount(0);

  await expect(answer(page).getByText("Answer complete.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("trust-notice")).toContainText("High confidence");

  const chip = answer(page).getByRole("button", { name: /Veltrix in Germany, Mar 2026/ });
  await chip.focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog", { name: "Germany · Veltrix · Mar 2026" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("Source: dataset")).toBeVisible();
  await expect(drawer.getByRole("row", { name: /Actual revenue/ })).toContainText("$427,196");
  await expect(drawer.getByRole("row", { name: /Forecast \$/ })).toContainText("$461,648");

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations).toEqual([]);
  await shot(page, `docs/evidence/P3/evidence-drawer-${testInfo.project.name}.png`);

  // Escape closes the modal and focus returns to the chip that opened it.
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(chip).toBeFocused();

  // Focus stays inside the modal while it is open.
  await chip.click();
  await expect(drawer).toBeVisible();
  for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.closest("dialog") !== null)).toBe(true);

  await drawer.getByRole("button", { name: "Open in dashboard" }).click();
  await expect(drawer).toBeHidden();
  await expect(page).toHaveURL(/\?region=eu&market=de&product=veltrix&period=2026-03$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Germany · Veltrix");
  await expect(page.getByRole("combobox", { name: "Period" })).toHaveValue("2026-03");
});

test("the corrected 'at risk' answer reports six flagged markets and every citation opens", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile");
  await gotoReady(page, "/");
  await composer(page).fill("Which markets are at risk this quarter, and why?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(answer(page).getByText("Answer complete.")).toBeVisible({ timeout: 25_000 });
  await expect(answer(page)).toContainText("Six markets are flagged");
  await expect(answer(page).getByText("Evidence (7)")).toBeVisible();
  await expect(answer(page).getByText(/Unresolved reference/)).toHaveCount(0);
});

test("an abstention shows 'Can't answer from this data' and no confidence level", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile");
  await gotoReady(page, "/");
  await composer(page).fill("What will sales look like next year?");
  await page.getByRole("button", { name: "Send" }).click();
  const notice = page.getByTestId("trust-notice");
  await expect(notice).toHaveAttribute("data-kind", "abstain", { timeout: 15_000 });
  await expect(notice).toContainText("Can't answer from this data");
  await expect(notice).not.toContainText(/confidence/i);
});
