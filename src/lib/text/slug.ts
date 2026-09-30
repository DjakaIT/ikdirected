// Album slugs (AC-ALBED-02): generated server-side from the title on first publish, then frozen.

/** Categories and top-level routes an album slug may never take. */
export const RESERVED_SLUGS = new Set(["vjencanja", "eventi", "portreti", "iz-zraka", "admin", "api"]);

const MAP: Record<string, string> = { č: "c", ć: "c", đ: "d", š: "s", ž: "z", dž: "dz" };

/** "Ana i Marko — Nin, 2025." → "ana-i-marko-nin-2025" */
export function slugify(title: string): string {
  const base = title
    .toLocaleLowerCase("hr")
    .replace(/dž|[čćđšž]/g, (m) => MAP[m] ?? m)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return base || "album";
}

/**
 * First free slug for a title: reserved words and taken slugs get "-2", "-3", …
 * `taken` is the set of slugs already in use (including deleted albums' slugs).
 */
export function uniqueSlug(title: string, taken: ReadonlySet<string>): string {
  const base = slugify(title);
  let candidate = base;
  let n = 1;
  while (RESERVED_SLUGS.has(candidate) || taken.has(candidate)) {
    n++;
    candidate = `${base}-${n}`;
  }
  return candidate;
}
