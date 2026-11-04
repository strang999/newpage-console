import AxeBuilder from "@axe-core/playwright";
import { gotoReady } from "./helpers";
import { expect, test } from "@playwright/test";

test("shell renders with landmarks, one h1 and no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await gotoReady(page, "/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("main")).toBeVisible();

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  // The focus indicator must actually render, including in forced-colors mode.
  await expect(skip).toHaveCSS("box-shadow", /rgb/);
  await page.emulateMedia({ forcedColors: "active" });
  await expect(skip).toHaveCSS("outline-style", "solid");
  await expect(skip).not.toHaveCSS("outline-color", "rgba(0, 0, 0, 0)");
  await page.emulateMedia({ forcedColors: "none" });

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("chat stream arrives in multiple chunks over time (not one buffered body)", async ({ page }) => {
  await gotoReady(page, "/");
  const result = await page.evaluate(async () => {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "germany" }),
    });
    if (!res.body) throw new Error("no response body");
    const reader = res.body.getReader();
    const t0 = performance.now();
    const arrivals: number[] = [];
    let tail = "";
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arrivals.push(Math.round(performance.now() - t0));
      tail = (tail + decoder.decode(value, { stream: true })).slice(-4000);
    }
    return { chunks: arrivals.length, first: arrivals[0] ?? 0, last: arrivals.at(-1) ?? 0, tail };
  });
  expect(result.chunks).toBeGreaterThan(5);
  expect(result.last - result.first).toBeGreaterThan(500);
  expect(result.tail).toContain('"type":"done"');
  expect(result.tail).toContain('"confidence":"high"');
});

test("the page declares an app icon that exists, so a normal visit never logs a favicon 404", async ({ page, request, baseURL }) => {
  await gotoReady(page, "/");
  const href = await page.locator('link[rel~="icon"]').first().getAttribute("href");
  expect(href).toMatch(/icon/);
  const res = await request.get(new URL(href ?? "", baseURL).toString());
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/svg");
});
