/**
 * `?stranica=N` (AC-ARC-03). Absent → 1. Anything but a canonical positive integer → null
 * (the page answers 404; "01", "1.0", "-1", "abc" and repeated params are all invalid).
 */
export function parsePageParam(url: URL): number | null {
  const all = url.searchParams.getAll("stranica");
  if (all.length === 0) return 1;
  if (all.length > 1) return null;
  const raw = all[0]!;
  if (!/^[1-9]\d{0,4}$/.test(raw)) return null;
  return Number(raw);
}
