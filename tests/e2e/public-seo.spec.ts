import { expect, test, type Page } from "@playwright/test";

const PAGES = ["/", "/radovi", "/radovi/vjencanja", "/radovi/testni-album-1", "/privatnost"];

async function jsonLd(page: Page): Promise<Array<Record<string, unknown>>> {
  const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
  return raw.flatMap((r) => {
    const parsed = JSON.parse(r) as { "@graph"?: Array<Record<string, unknown>> };
    return parsed["@graph"] ?? [parsed as Record<string, unknown>];
  });
}
const types = (nodes: Array<Record<string, unknown>>) => nodes.flatMap((n) => [n["@type"]].flat());

test.describe("SEO", () => {
  test("AC-SEO-01 unique title and description, canonical, OG image on every public page", async ({ page }) => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const path of PAGES) {
      await page.goto(path);
      titles.add(await page.title());
      descriptions.add((await page.locator('meta[name="description"]').getAttribute("content")) ?? "");
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^https?:\/\/[^/]+\//);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /^https?:\/\//);
      await expect(page.locator("html")).toHaveAttribute("lang", "hr");
    }
    expect(titles.size).toBe(PAGES.length);
    expect(descriptions.size).toBe(PAGES.length);
  });

  test("AC-SEO-02 JSON-LD graphs per page type", async ({ page }) => {
    await page.goto("/");
    const home = types(await jsonLd(page));
    for (const t of ["ProfessionalService", "LocalBusiness", "WebSite", "FAQPage"]) expect(home).toContain(t);

    await page.goto("/radovi");
    const arc = types(await jsonLd(page));
    expect(arc).toContain("CollectionPage");
    expect(arc).toContain("BreadcrumbList");

    await page.goto("/radovi/testni-album-1");
    const alb = types(await jsonLd(page));
    expect(alb).toContain("ImageGallery");
    expect(alb).toContain("BreadcrumbList");
  });

  test("AC-SEO-03 sitemap lists pages and albums; robots keeps admin and API out", async ({ request }) => {
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.headers()["content-type"]).toContain("application/xml");
    const xml = await sitemap.text();
    expect(xml).toContain("<urlset");
    for (const p of ["/radovi</loc>", "/radovi/vjencanja</loc>", "/radovi/iz-zraka</loc>", "/radovi/testni-album-1</loc>"]) {
      expect(xml).toContain(p);
    }
    expect(xml).not.toContain("testni-album-9"); // deleted
    expect(xml).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toContain("Disallow: /api");
  });

  test("AC-SEO-04 meaningful text is in the server HTML", async ({ request }) => {
    const html = await (await request.get("/radovi/testni-album-1")).text();
    expect(html).toMatch(/Vjenčanje · [^<]+ · [a-zčćžšđ]+ \d{4}\. · \d+ fotografij/);
    const home = await (await request.get("/")).text();
    expect(home).toContain("Volim kad me se ne primijeti");
  });

  test("AC-SEO-05 every non-decorative image has a non-empty alt", async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      const missing = await page
        .locator("img")
        .evaluateAll((imgs) =>
          imgs
            .filter((i) => !i.closest('[aria-hidden="true"]') && i.getAttribute("aria-hidden") !== "true")
            .filter((i) => !i.closest("dialog"))
            .filter((i) => !(i.getAttribute("alt") ?? "").trim())
            .map((i) => i.outerHTML.slice(0, 120)),
        );
      expect(missing, path).toEqual([]);
    }
  });
});
