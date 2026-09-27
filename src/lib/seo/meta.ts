/** Absolute URL for a site path, e.g. absoluteUrl("https://x.hr", "/radovi") → "https://x.hr/radovi". */
export function absoluteUrl(origin: string, path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return origin.replace(/\/+$/, "") + (path.startsWith("/") ? path : `/${path}`);
}
