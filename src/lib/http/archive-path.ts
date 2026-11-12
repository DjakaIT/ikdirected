import type { CategorySlug } from "../../content/site";

/**
 * Archive URLs (AC-ARC-03): page 1 is the bare listing, later pages are /stranica/N.
 * archivePath() → "/radovi", archivePath("eventi", 3) → "/radovi/eventi/stranica/3".
 */
export function archivePath(category?: CategorySlug, page = 1): string {
  const base = category ? `/radovi/${category}` : "/radovi";
  return page > 1 ? `${base}/stranica/${page}` : base;
}
