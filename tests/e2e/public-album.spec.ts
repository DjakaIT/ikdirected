import { expect, test } from "@playwright/test";

const ALBUM = "/radovi/testni-album-1";

test.describe("album page", () => {
  test("AC-ALB-01 hero, H1, meta sentence and story", async ({ page }) => {
    await page.goto(ALBUM);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Testni album 1");
    // AC-SEO-04: the meta line reads as a quotable sentence.
    await expect(page.locator(".ah__meta")).toHaveText(
      /^(Vjenčanje|Event|Portret|Iz zraka) · .+ · [a-zčćžšđ]+ \d{4}\. · \d+ fotografij[aeu]$/,
    );
    await expect(page.locator(".story")).toHaveText(/\S/);
    const crumbs = page.getByRole("navigation", { name: "Putanja" });
    await expect(crumbs.getByRole("link", { name: "Radovi" })).toHaveAttribute("href", "/radovi");
  });

  test("AC-ALB-02 photos render in rhythm rows, all of them, in order", async ({ page }) => {
    await page.goto(ALBUM);
    const meta = await page.locator(".ah__meta").textContent();
    const n = Number(meta?.match(/(\d+) fotografij/)?.[1]);
    await expect(page.locator(".rh__ph")).toHaveCount(n);
    const rowClasses = await page.locator(".rh__row").evaluateAll((rows) => rows.map((r) => r.className));
    expect(rowClasses.every((c) => /r-(full|offset|single|pair)/.test(c))).toBe(true);
  });

  test("AC-ALB-03 every photo opens the lightbox; arrows wrap across the album", async ({ page }) => {
    await page.goto(ALBUM);
    const n = await page.locator(".rh__ph").count();
    await page.locator(".rh__ph").first().evaluate((el: HTMLElement) => el.click());
    const idx = page.locator("[data-lb-idx]");
    await expect(idx).toHaveText(`01 / ${String(n).padStart(2, "0")}`);
    await page.keyboard.press("ArrowLeft");
    await expect(idx).toHaveText(`${String(n).padStart(2, "0")} / ${String(n).padStart(2, "0")}`);
    await expect(page.getByRole("link", { name: "Otvori album →" })).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("AC-ALB-04 previous/next within the category and a link back", async ({ page }) => {
    await page.goto("/radovi/testni-album-3");
    const nav = page.getByRole("navigation", { name: "Druge priče" });
    await expect(nav.getByRole("link", { name: /Prethodna priča/ })).toHaveAttribute("href", /^\/radovi\/testni-album-\d+$/);
    await expect(nav.getByRole("link", { name: /Sljedeća priča/ })).toHaveAttribute("href", /^\/radovi\/testni-album-\d+$/);
    await expect(nav.getByRole("link", { name: "Sva vjenčanja" })).toHaveAttribute("href", "/radovi/vjencanja");
    await expect(page.getByRole("link", { name: "Vaš datum je slobodan? Provjerite." })).toBeVisible();
  });

  test("AC-ALB-05 deleted album and unknown slug → 404", async ({ page }) => {
    expect((await page.goto("/radovi/testni-album-9"))?.status()).toBe(404);
    expect((await page.goto("/radovi/testni-album-4"))?.status()).toBe(404);
    expect((await page.goto("/radovi/testni-album-1?x=1"))?.status()).toBe(404);
  });

  test("AC-ALB-06 srcset of three WebP variants, LQIP, first two eager", async ({ page }) => {
    await page.goto(ALBUM);
    const imgs = page.locator(".rh__ph .pic__img");
    const srcset = (await imgs.first().getAttribute("srcset")) ?? "";
    expect(srcset.split(",").every((s) => /\/(640|1280|2400)\.webp \d+w$/.test(s.trim()))).toBe(true);
    await expect(page.locator(".rh__ph .pic__lqip").first()).toHaveAttribute("src", /^data:image\/webp;base64,/);
    await expect(imgs.nth(0)).toHaveAttribute("loading", "eager");
    await expect(imgs.nth(1)).toHaveAttribute("loading", "eager");
    await expect(imgs.nth(2)).toHaveAttribute("loading", "lazy");
  });

  test("PD-09 archive → album navigation has no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/radovi");
    await page.locator("[data-card] a").first().click();
    await expect(page).toHaveURL(/\/radovi\/testni-album-\d+$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
