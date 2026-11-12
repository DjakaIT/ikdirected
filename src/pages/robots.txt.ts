// AC-SEO-03 / AC-ADM-04: keep crawlers out of the admin and the API.
import type { APIRoute } from "astro";
import { siteOrigin } from "../lib/env";

export const GET: APIRoute = () => {
  const body = ["User-agent: *", "Disallow: /admin", "Disallow: /api", "", `Sitemap: ${siteOrigin()}/sitemap.xml`, ""].join(
    "\n",
  );
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
