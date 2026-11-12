/**
 * Croatian plural (DESIGN §9): 1, 21, 31… → one; 2–4, 22–24… → few; everything else → many.
 * 11–14 are always "many" ("11 fotografija", "12 priča").
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** "84 fotografije" style phrase. */
export const countPhotos = (n: number): string =>
  `${n} ${plural(n, "fotografija", "fotografije", "fotografija")}`;

export const countStories = (n: number): string => `${n} ${plural(n, "priča", "priče", "priča")}`;

// Feminine forms (agree with "fotografija"), 1–12 — the home track never has more than 12.
const FEMININE = [
  "nula", "jedna", "dvije", "tri", "četiri", "pet", "šest",
  "sedam", "osam", "devet", "deset", "jedanaest", "dvanaest",
];

/** Number as a word for 0–12 (feminine), digits otherwise. */
export function numberWordFeminine(n: number): string {
  return FEMININE[n] ?? String(n);
}
