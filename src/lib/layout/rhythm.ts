// Album page layout (ARCHITECTURE §7.1). Pure and deterministic: the photographer never picks
// layouts — rows follow from the photos' aspect ratios and order.
import { kindOf } from "./track";

export interface Sized {
  width: number;
  height: number;
}

export type Row<T extends Sized> =
  | { type: "pair"; variant: "a" | "b"; items: [T, T] }
  | { type: "full"; side: "left" | "right"; items: [T] }
  | { type: "offset"; side: "left" | "right"; items: [T] }
  | { type: "single"; items: [T] };

export function rhythm<T extends Sized>(photos: readonly T[]): Row<T>[] {
  const rows: Row<T>[] = [];
  let i = 0;
  let wides = 0;
  let pairs = 0;
  while (i < photos.length) {
    const p = photos[i]!;
    const next = photos[i + 1];
    const kind = kindOf(p.width, p.height);
    if (kind === "tall" && next && kindOf(next.width, next.height) === "tall") {
      rows.push({ type: "pair", variant: pairs++ % 2 ? "b" : "a", items: [p, next] });
      i += 2;
    } else if (kind === "wide") {
      const side = wides % 2 ? "left" : "right";
      rows.push(wides % 3 === 0 ? { type: "full", side, items: [p] } : { type: "offset", side, items: [p] });
      wides++;
      i++;
    } else {
      rows.push({ type: "single", items: [p] });
      i++;
    }
  }
  return rows;
}

/** CSS class for a row (no inline styles — SECURITY §4). */
export function rowClass(row: Row<Sized>): string {
  switch (row.type) {
    case "pair":
      return `r-pair r-pair-${row.variant}`;
    case "full":
      return "r-full";
    case "offset":
      return `r-offset r-offset-${row.side}`;
    case "single":
      return "r-single";
  }
}
