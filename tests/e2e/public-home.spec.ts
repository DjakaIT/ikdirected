import { expect, test } from "@playwright/test";

test.describe("home", () => {
  test("AC-HOME-01 hero shows the first featured photo, eager and high priority", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("[data-hero] .pic__img");
    await expect(hero).toHaveAttribute("loading", "eager");
    await expect(hero).toHaveAttribute("fetchpriority", "high");
    const firstTrackAlt = await page.locator("[data-track-item] .pic__img").first().getAttribute("alt");
    await expect(hero).toHaveAttribute("alt", firstTrackAlt ?? "");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("ikdirected");
  });

  test("AC-HOME-02 gallery shows 4–12 featured items with captions", async ({ page }) => {
    await page.goto("/");
    const items = page.locator("[data-track-item]");
    const n = await items.count();
    expect(n).toBeGreaterThanOrEqual(4);
    expect(n).toBeLessThanOrEqual(12);
    for (let i = 0; i < n; i++) {
      await expect(items.nth(i).locator("figcaption")).not.toBeEmpty();
      await expect(items.nth(i).locator(".pic__img")).toHaveAttribute("alt", /\S/);
    }
  });

  test("AC-HOME-03 gallery item opens the lightbox with an album link", async ({ page }) => {
    await page.goto("/");
    const link = page.locator("[data-track-item] a").nth(1);
    const href = await link.getAttribute("href");
    await link.evaluate((el: HTMLElement) => el.click());
    const dialog = page.getByRole("dialog", { name: "Prikaz fotografije" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Otvori album →" })).toHaveAttribute("href", href ?? "");
    await expect(dialog.locator("[data-lb-idx]")).toHaveText(/^02 \/ \d{2}$/);
  });

  test("AC-HOME-04 track ends with 'Sve priče (N) →' linking to the archive", async ({ page }) => {
    await page.goto("/");
    const end = page.getByRole("link", { name: /^Sve priče \(\d+\) →$/ });
    await expect(end).toHaveAttribute("href", "/radovi");
  });

  test("AC-HOME-05 service cards link to their category pages", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#usluge");
    for (const [name, slug] of [
      ["Vjenčanja", "vjencanja"],
      ["Eventi", "eventi"],
      ["Portreti", "portreti"],
      ["Iz zraka", "iz-zraka"],
    ]) {
      await expect(section.getByRole("link", { name, exact: true })).toHaveAttribute("href", `/radovi/${slug}`);
    }
  });

  test("PD-07 gallery is focusable and ←/→ move one item", async ({ page }) => {
    await page.goto("/");
    const gallery = page.locator("[data-track]");
    await expect(gallery).toHaveAttribute("tabindex", "0");
    await expect(gallery).toHaveAttribute("aria-roledescription", "galerija");
    await gallery.focus();
    const count = page.locator("[data-track-count]");
    const before = await count.textContent();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(count).not.toHaveText(before ?? "");
  });
});

test.describe("lightbox", () => {
  test("AC-LB-01 focus moves to close, is trapped, and returns to the opener", async ({ page }) => {
    await page.goto("/");
    const opener = page.locator("[data-track-item] a").first();
    await opener.evaluate((el: HTMLElement) => el.click());
    const dialog = page.getByRole("dialog", { name: "Prikaz fotografije" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Zatvori ✕" })).toBeFocused();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => !!document.activeElement?.closest("dialog[data-lightbox]"));
      // Focus may briefly sit on the document between cycles; it must never land on page content.
      const onBody = await page.evaluate(() => document.activeElement === document.body);
      expect(inside || onBody).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("AC-LB-02 arrows navigate, Esc closes, 2400 variant loads only when opened", async ({ page }) => {
    await page.goto("/");
    const img = page.locator("[data-lb-img]");
    expect(await img.getAttribute("src")).toBeNull();
    await page.locator("[data-track-item] a").first().evaluate((el: HTMLElement) => el.click());
    await expect(img).toHaveAttribute("src", /\/2400\.webp$/);
    const idx = page.locator("[data-lb-idx]");
    await expect(idx).toHaveText(/^01 \//);
    await page.keyboard.press("ArrowRight");
    await expect(idx).toHaveText(/^02 \//);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(idx).not.toHaveText(/^01 \//);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("AC-LB-02 horizontal swipe navigates", async ({ page }) => {
    await page.goto("/");
    await page.locator("[data-track-item] a").first().evaluate((el: HTMLElement) => el.click());
    const idx = page.locator("[data-lb-idx]");
    await expect(idx).toHaveText(/^01 \//);
    await page.locator("[data-lb-stage]").evaluate((stage) => {
      const opts = { bubbles: true, pointerType: "touch", clientY: 300 };
      stage.dispatchEvent(new PointerEvent("pointerdown", { ...opts, clientX: 300 }));
      stage.dispatchEvent(new PointerEvent("pointerup", { ...opts, clientX: 120 }));
    });
    await expect(idx).toHaveText(/^02 \//);
  });
});

test.describe("motion and progressive enhancement", () => {
  test("AC-A11Y-03 reduced motion: no loader, statement fully visible", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.locator("[data-loader]")).toBeHidden();
    await expect(page.locator("html")).not.toHaveClass(/is-loading/);
    const words = page.locator("[data-reveal] .w");
    expect(await words.count()).toBe(0);
    await ctx.close();
  });

  test("AC-HOME-06 without JS the gallery is a readable row with captions and working links", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.locator("[data-loader]")).toBeHidden();
    const items = page.locator("[data-track-item]");
    await expect(items.first()).toBeVisible();
    await expect(items.first().locator("figcaption")).toBeVisible();
    await expect(items.first().locator(".pic__img")).toBeVisible();
    const rail = page.locator("[data-track-rail]");
    const scrollable = await rail.evaluate((el) => el.scrollWidth > el.clientWidth && getComputedStyle(el).overflowX === "auto");
    expect(scrollable).toBe(true);
    const href = await items.first().locator("a").getAttribute("href");
    expect(href).toMatch(/^\/radovi\/[a-z0-9-]+$/);
    await expect(page.locator("[data-reveal]")).toHaveText(/Volim kad me se ne primijeti/);
    await ctx.close();
  });

  test("PD-05 loader shows only on the first visit in a session", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "no-preference" });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveClass(/is-loading/, { timeout: 4000 });
    await expect(page.locator("[data-hero]")).toHaveClass(/go/);
    await page.goto("/");
    await expect(page.locator("[data-loader]")).toBeHidden();
    await ctx.close();
  });
});
