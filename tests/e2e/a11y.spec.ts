import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// AC-A11Y-01: 0 serious/critical violations on every public route and admin screen.
const ROUTES = [
  "/",
  "/radovi",
  "/radovi/vjencanja",
  "/radovi/testni-album-1",
  "/privatnost",
  "/stranica-koja-ne-postoji",
  "/admin",
  "/admin/albumi/00000000-0000-4000-8000-0000000186a1",
  "/admin/naslovnica",
];

for (const route of ROUTES) {
  test(`AC-A11Y-01 axe has no serious or critical violations on ${route}`, async ({ page }) => {
    await page.goto(route);
    // Let the loader settle, then read the page top to bottom like a visitor so scroll-driven
    // states (PD-10 word reveal starts at .28 opacity) are in the state a reader actually sees.
    await expect(page.locator("html")).not.toHaveClass(/is-loading/, { timeout: 4000 });
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0); // admin islands finished loading
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y <= height; y += 600) {
      await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(600);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    const report = blocking.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
    expect(report, report.join("\n")).toEqual([]);
  });
}
