import { env } from "cloudflare:workers";

/** Canonical origin without trailing slash. Never derived from the request Host header. */
export function siteOrigin(): string {
  return (env.SITE_ORIGIN || "https://ikdirected.com").replace(/\/+$/, "");
}
