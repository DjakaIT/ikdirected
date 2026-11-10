import AxeBuilder from "@axe-core/playwright";
import { expect, seed, test, type Page } from "./admin-fixture";

// AC-A11Y-01: 0 serious/critical violations on every public route and admin screen (signed in, and the sign-in
// screens themselves).
const ROUTES: Array<{ path: string; admin?: "in" | "out" | "setup" }> = [
  { path: "/" },
  { path: "/radovi" },
  { path: "/radovi/vjencanja" },
  { path: "/radovi/stranica/2" },
  { path: "/radovi/testni-album-1" },
  { path: "/privatnost" },
  { path: "/stranica-koja-ne-postoji" },
  { path: "/admin", admin: "in" },
  { path: "/admin/albumi/00000000-0000-4000-8000-0000000186a1", admin: "in" },
  { path: "/admin/naslovnica", admin: "in" },
  { path: "/admin", admin: "out" },
  { path: "/admin", admin: "setup" },
];

async function audit(page: Page): Promise<void> {
  // Let the loader settle, then read the page top to bottom like a visitor so scroll-driven
  // states (PD-10 word reveal starts at .28 opacity) are in the state a reader actually sees.
  await expect(page.locator("html")).not.toHaveClass(/is-loading/, { timeout: 4000 });
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0); // admin islands finished loading
  await expect(page.getByText("Učitavam…")).toHaveCount(0);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= height; y += 600) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(600);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = blocking.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(report, report.join("\n")).toEqual([]);
}

for (const { path, admin } of ROUTES) {
  test(`AC-A11Y-01 axe has no serious or critical violations on ${path}${admin && admin !== "in" ? ` (${admin === "out" ? "sign-in" : "first setup"})` : ""}`, async ({ page }) => {
    if (admin === "in") await seed(page);
    if (admin === "out") await seed(page, { user: true }).then(() => page.context().clearCookies({ name: "ik-admin" }));
    if (admin === "setup") await seed(page, { user: false, empty: true });
    await page.goto(path);
    if (admin === "out") await expect(page.getByRole("heading", { name: "Prijava" })).toBeVisible();
    if (admin === "setup") await expect(page.getByRole("heading", { name: "Postavljanje administracije" })).toBeVisible();
    await audit(page);
  });
}
