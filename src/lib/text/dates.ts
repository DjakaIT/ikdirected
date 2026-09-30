// Croatian month names (DESIGN §9). Meta lines use the nominative with the year ("lipanj 2025."),
// running text uses the genitive ("12. lipnja 2025.").

export const MONTHS_NOMINATIVE = [
  "siječanj", "veljača", "ožujak", "travanj", "svibanj", "lipanj",
  "srpanj", "kolovoz", "rujan", "listopad", "studeni", "prosinac",
] as const;

export const MONTHS_GENITIVE = [
  "siječnja", "veljače", "ožujka", "travnja", "svibnja", "lipnja",
  "srpnja", "kolovoza", "rujna", "listopada", "studenoga", "prosinca",
] as const;

interface Ymd {
  year: number;
  month: number; // 1–12
  day: number;
}

export function parseYmd(date: string): Ymd {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** "lipanj 2025." */
export function monthYear(date: string): string {
  const { year, month } = parseYmd(date);
  return `${MONTHS_NOMINATIVE[month - 1]} ${year}.`;
}

/** "12. lipnja 2025." */
export function longDate(date: string): string {
  const { year, month, day } = parseYmd(date);
  return `${day}. ${MONTHS_GENITIVE[month - 1]} ${year}.`;
}

/** "06/2025" — compact form for archive cards (DESIGN §5.2). */
export function monthYearNumeric(date: string): string {
  const { year, month } = parseYmd(date);
  return `${String(month).padStart(2, "0")}/${year}`;
}

export const yearOf = (date: string): number => parseYmd(date).year;
