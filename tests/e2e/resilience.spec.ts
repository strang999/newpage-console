import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { gotoReady, shot } from "./helpers";

const countries = (page: Page) => page.getByRole("button", { name: /Press Enter to open/ });
const mapSection = (page: Page) => page.getByRole("region", { name: "Markets on the map" });

/** Fails the lazily loaded chunk that contains the world geometry, as a flaky network or a bad deploy would. */
async function breakMapChunk(page: Page) {
  await page.route("**/_next/static/chunks/**", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes('"Fiji"')) return route.abort("failed");
    return route.fulfill({ response, body });
  });
}

test("a failed map chunk leaves the rest of the dashboard alive, with the table as the map", async ({ page }, testInfo) => {
  await breakMapChunk(page);
  await gotoReady(page, "/");

  const alert = mapSection(page).getByRole("alert");
  await expect(alert).toContainText("The map could not be drawn.");
  const table = mapSection(page).getByRole("table", { name: /^Revenue by market for / }); // the month in the caption changes with the period
  await expect(table.locator("tbody tr")).toHaveCount(13);
  await expect(table.getByRole("row", { name: /Germany/ })).toContainText("$1.68M");

  // Everything else still works: health strip, trend chart, top risks, period picker and drill from the fallback table.
  await expect(page.getByRole("region", { name: "Portfolio health" })).toBeVisible();
  await expect(page.locator(".recharts-line").first()).toBeVisible();
  await page.getByRole("combobox", { name: "Period" }).selectOption("2026-03");
  await expect(page).toHaveURL(/period=2026-03/);
  await table.getByRole("button", { name: "Japan" }).click();
  await expect(page).toHaveURL(/market=jp/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Japan");
  await shot(page, `docs/evidence/P9/map-fallback-${testInfo.project.name}.png`, { fullPage: true });

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations).toEqual([]);
});

test("Try again reloads the map once the network is back", async ({ page }) => {
  await breakMapChunk(page);
  await gotoReady(page, "/");
  await expect(mapSection(page).getByRole("alert")).toBeVisible();
  await page.unroute("**/_next/static/chunks/**");
  await mapSection(page).getByRole("button", { name: "Try again" }).click();
  await expect(countries(page)).toHaveCount(13);
  await expect(mapSection(page).getByRole("alert")).toHaveCount(0);
});

test("the assistant keeps working when it is the map that failed, and the other way round", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile");
  await breakMapChunk(page);
  await gotoReady(page, "/");
  await page.getByRole("textbox", { name: "Ask about the data" }).fill("Give me a full portfolio summary");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("article", { name: "Assistant answer" }).getByText("Answer complete.")).toBeVisible({ timeout: 25_000 });
  await expect(mapSection(page).getByRole("alert")).toBeVisible();
});

test("security headers: a same-origin-only CSP, no sniffing, no framing, a strict referrer policy, no powered-by", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  const csp = h["content-security-policy"] ?? "";
  for (const directive of ["default-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'"]) expect(csp, directive).toContain(directive);
  expect(csp).not.toContain("unsafe-eval"); // production build
  expect(csp).not.toMatch(/https?:\/\//); // nothing third-party is allowed
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["x-powered-by"]).toBeUndefined();
  const api = await request.post("/api/chat", { data: { question: "germany" } });
  expect(api.headers()["x-content-type-options"]).toBe("nosniff");
});

test("the CSP does not break the app: no CSP violation is reported on a full journey", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile");
  const violations: string[] = [];
  page.on("console", (m) => /content security policy/i.test(m.text()) && violations.push(m.text()));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => console.error(`Content Security Policy violation: ${e.violatedDirective} ${e.blockedURI}`));
  });
  await gotoReady(page, "/?mode=analyst&compareType=market&compare=de,it,gb");
  await expect(countries(page)).toHaveCount(13);
  await page.getByRole("textbox", { name: "Ask about the data" }).fill("Why did Germany's revenue dip in March 2026?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("article", { name: "Assistant answer" }).getByText("Answer complete.")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("article", { name: "Assistant answer" }).getByRole("button", { name: /Veltrix in Germany/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(violations).toEqual([]);
});

test("telemetry carries operational facts only: timings, retry count, terminal state; never the question, answer or citations; nothing leaves the origin", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile");
  const sent: { url: string; body: string }[] = [];
  const hosts = new Set<string>();
  page.on("request", (r) => hosts.add(new URL(r.url()).host));
  // A route sees the beacon's body reliably (the request event can fire before a Blob body is attached).
  await page.route("**/api/telemetry", async (route) => {
    sent.push({ url: route.request().url(), body: route.request().postData() ?? (await route.request().postDataBuffer())?.toString("utf8") ?? "" });
    await route.fulfill({ status: 204 });
  });
  await gotoReady(page, "/");
  await page.getByRole("textbox", { name: "Ask about the data" }).fill("SENTINEL_QUESTION about Germany");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("article", { name: "Assistant answer" }).getByText("Answer complete.")).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => sent.map((s) => s.body).join(" | "), { timeout: 5000 }).toContain("assistant_stream");

  const events = sent.map((s) => JSON.parse(s.body) as Record<string, unknown>);
  const stream = events.find((e) => e.event === "assistant_stream");
  expect(stream).toMatchObject({ event: "assistant_stream", terminalState: "complete", retryCount: 0 });
  expect(typeof stream?.durationMs).toBe("number");
  expect(typeof stream?.ttftMs).toBe("number");
  const allowed = new Set(["event", "attemptId", "durationMs", "ttftMs", "retryCount", "terminalState", "errorCode", "surface", "metric", "value", "rating", "navigationType"]);
  for (const e of events) for (const key of Object.keys(e)) expect(allowed.has(key), key).toBe(true);
  const everything = sent.map((s) => s.body).join("\n");
  for (const secret of ["SENTINEL", "Germany", "revenue", "citation", "Veltrix"]) expect(everything).not.toContain(secret);
  expect([...hosts]).toEqual([new URL(page.url()).host]); // no third-party host was contacted
});

test("a missing page shows a clear 404 inside the app shell", async ({ page }) => {
  const res = await page.goto("/definitely-not-a-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to the console" })).toBeVisible();
});

test("reduced motion: the radar and the trend chart render without draw-in animation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await gotoReady(page, "/?mode=analyst&compareType=market&compare=de,it,gb");
  const polygon = page.locator(".recharts-radar-polygon").first();
  await expect(polygon).toBeAttached();
  const first = await polygon.getAttribute("points");
  await page.waitForTimeout(1200);
  expect(await polygon.getAttribute("points")).toBe(first); // already at its final shape the first time it is seen
  const dash = await page.locator(".recharts-line").first().locator("path.recharts-line-curve").evaluate((el) => getComputedStyle(el).strokeDasharray);
  expect(dash).toBe("none");
});
