/** Canonical origin without trailing slash (astro.config `site`, from SITE_ORIGIN at build time). */
export function siteOrigin(): string {
  return (import.meta.env.SITE || "https://ikdirected.com").replace(/\/+$/, "");
}
