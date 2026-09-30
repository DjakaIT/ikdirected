import { expect, test } from "@playwright/test";

test.describe("archive /radovi", () => {
  test("AC-ARC-01 lists albums newest first under year dividers", async ({ page }) => {
    await page.goto("/radovi");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Radovi");
    const years = await page.locator("[data-year]").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-year"))));
    expect(years.length).toBeGreaterThan(1);
    expect([...years].sort((a, b) => b - a)).toEqual(years);
    for (const y of years) await expect(page.getByRole("heading", { level: 2, name: `${y}.` })).toBeAttached();
    await expect(page.locator(".arc__meta")).toHaveText(/^\d+ priča · \d{4}\. — \d{4}\.$/);
  });

  test("AC-ARC-02 chips are links with counts and mark the active filter", async ({ page }) => {
    await page.goto("/radovi");
    const chips = page.getByRole("navigation", { name: "Kategorije" });
    await expect(chips.getByRole("link", { name: /^Sve \d+$/ })).toHaveAttribute("aria-current", "page");
    for (const [name, slug] of [
      ["Vjenčanja", "vjencanja"],
      ["Eventi", "eventi"],
      ["Portreti", "portreti"],
      ["Iz zraka", "iz-zraka"],
    ]) {
      await expect(chips.getByRole("link", { name: new RegExp(`^${name} \\d+$`) })).toHaveAttribute("href", `/radovi/${slug}`);
    }
  });

  test("AC-ARC-03 24 per page, 'Učitaj još' appends the next page and updates the URL", async ({ page }) => {
    await page.goto("/radovi");
    const cards = page.locator("[data-card]");
    await expect(cards).toHaveCount(24);
    const more = page.getByRole("link", { name: "Učitaj još" });
    await expect(more).toHaveAttribute("href", "/radovi?stranica=2");
    await more.click();
    await expect(page).toHaveURL(/\/radovi\?stranica=2$/);
    expect(await cards.count()).toBeGreaterThan(24);
    await expect(more).toHaveCount(0);
    // Year groups are merged, never duplicated.
    const years = await page.locator("[data-year]").evaluateAll((els) => els.map((e) => e.getAttribute("data-year")));
    expect(new Set(years).size).toBe(years.length);
  });

  test("AC-ARC-03 invalid or out-of-range page → 404", async ({ page }) => {
    for (const q of ["0", "01", "abc", "1.0", "-1", "99"]) {
      const res = await page.goto(`/radovi?stranica=${q}`);
      expect(res?.status(), q).toBe(404);
    }
  });

  test("AC-ARC-04 search filters loaded cards and announces the result", async ({ page }) => {
    await page.goto("/radovi");
    const search = page.getByRole("searchbox", { name: "Traži po mjestu ili nazivu" });
    await expect(search).toBeVisible();
    await search.fill("album 12");
    await expect(page.locator("[data-card]:visible")).toHaveCount(1);
    await expect(page.locator("[data-found]")).toHaveText("Pronađeno 1 priča");
    await search.fill("mjesto");
    await expect(page.locator("[data-found]")).toHaveText(/^Pronađeno \d+ priča|priče$/);
    await search.fill("nema toga nigdje");
    await expect(page.getByText("Nema priča za ovaj pojam.")).toBeVisible();
    await search.fill("");
    await expect(page.locator("[data-card]:visible")).toHaveCount(24);
  });

  test("AC-ARC-05 card shows cover, title, place, month/year and count", async ({ page }) => {
    await page.goto("/radovi");
    const card = page.locator("[data-card]").first();
    await expect(card.locator(".card__t")).toHaveText(/\S/);
    await expect(card.locator(".card__m")).toHaveText(/^.+ · \d{2}\/\d{4} · \d+$/);
    await expect(card.locator(".pic:not([aria-hidden]) .pic__img")).toHaveAttribute("alt", /\S/);
    // The hover photo is decorative.
    await expect(card.locator(".card__alt")).toHaveAttribute("aria-hidden", "true");
  });
});

test.describe("archive without JS", () => {
  test("AC-ARC-02/03 filters and pagination work as plain links; search stays hidden", async ({ browser }) => {
    // Reduced motion turns off PD-09 view transitions: with JS disabled, Playwright's rAF-based
    // actionability check stalls if it clicks mid-transition (the real click works — see PROGRESS).
    const ctx = await browser.newContext({ javaScriptEnabled: false, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/radovi");
    await expect(page.locator("[data-search-wrap]")).toBeHidden();
    await page.getByRole("link", { name: "Učitaj još" }).click();
    await expect(page).toHaveURL(/stranica=2/);
    expect(await page.locator("[data-card]").count()).toBeGreaterThan(0);
    await page.getByRole("navigation", { name: "Kategorije" }).getByRole("link", { name: /^Eventi/ }).click();
    await expect(page).toHaveURL(/\/radovi\/eventi$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Eventi");
    await ctx.close();
  });
});

test.describe("category /radovi/{kategorija}", () => {
  test("AC-CAT-01 own H1, intro and active chip; only that category", async ({ page }) => {
    await page.goto("/radovi/vjencanja");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Vjenčanja");
    await expect(page.locator(".arc__intro")).toContainText("Vjenčanja snimam");
    const chip = page.getByRole("navigation", { name: "Kategorije" }).getByRole("link", { name: /^Vjenčanja \d+$/ });
    await expect(chip).toHaveAttribute("aria-current", "page");
    const count = Number((await chip.textContent())?.match(/\d+/)?.[0]);
    await expect(page.locator("[data-card]")).toHaveCount(Math.min(24, count));
  });

  test("AC-CAT-02 unknown category or album slug → 404", async ({ page }) => {
    for (const path of ["/radovi/vjencanje", "/radovi/nepostojeci-album", "/radovi/admin"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
    }
  });

  test("SEC-ENUM-01 deleted/draft album and unknown slug give byte-identical 404 bodies", async ({ request }) => {
    const deleted = await request.get("/radovi/testni-album-9");
    const unknown = await request.get("/radovi/testni-album-999");
    expect(deleted.status()).toBe(404);
    expect(unknown.status()).toBe(404);
    expect(await deleted.text()).toBe(await unknown.text());
  });
});
