import { expect, test } from "@playwright/test";

const ORIGIN = "http://localhost:4321";

for (const path of ["/", "/stranica-koja-ne-postoji"]) {
  test.describe(`layout ${path}`, () => {
    test("AC-SEO-01 lang, title, description and canonical", async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", "hr");
      await expect(page).toHaveTitle(/ikdirected/);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.{20,}/);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
      expect(canonical?.startsWith(ORIGIN)).toBe(true);
    });

    test("exactly one H1 and all landmarks", async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.getByRole("banner")).toHaveCount(1);
      await expect(page.getByRole("navigation", { name: "Glavna navigacija" })).toBeVisible();
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("contentinfo")).toHaveCount(1);
    });

    test("skip link moves focus to main content", async ({ page }) => {
      await page.goto(path);
      await page.keyboard.press("Tab");
      const skip = page.getByRole("link", { name: "Prijeđi na sadržaj" });
      await expect(skip).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator("main")).toBeFocused();
    });
  });
}

test("404 page returns 404 with links home and to the archive", async ({ page }) => {
  const res = await page.goto("/stranica-koja-ne-postoji");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("404");
  await expect(page.getByText("Ova stranica ne postoji ili je premještena.")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Naslovnica" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("main").getByRole("link", { name: "Svi radovi" })).toHaveAttribute("href", "/radovi");
});
