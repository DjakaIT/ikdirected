// AC-SEO-03: home, archive, the four categories and every published album with lastmod.
import type { APIRoute } from "astro";
import { site } from "../content/site";
import { listSitemapAlbums } from "../lib/data/public";
import { siteOrigin } from "../lib/env";

const xmlEscape = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const GET: APIRoute = async () => {
  const origin = siteOrigin();
  const albums = await listSitemapAlbums();
  const urls: Array<{ loc: string; lastmod?: string }> = [
    { loc: `${origin}/` },
    { loc: `${origin}/radovi` },
    ...site.categories.map((c) => ({ loc: `${origin}/radovi/${c.slug}` })),
    ...albums.map((a) => ({ loc: `${origin}/radovi/${a.slug}`, lastmod: a.updatedAt.slice(0, 10) })),
  ];
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map((u) => `  <url><loc>${xmlEscape(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`)
      .join("\n") +
    `\n</urlset>\n`;
  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
