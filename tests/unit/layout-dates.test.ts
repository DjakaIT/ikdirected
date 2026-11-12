import { describe, expect, it } from "vitest";
import { rhythm, rowClass, type Sized } from "../../src/lib/layout/rhythm";
import { longDate, monthYear, monthYearNumeric, yearOf } from "../../src/lib/text/dates";

type P = Sized & { id: number };
const W = (id: number): P => ({ id, width: 2400, height: 1600 }); // wide
const T = (id: number): P => ({ id, width: 1600, height: 2400 }); // tall
const S = (id: number): P => ({ id, width: 2400, height: 2400 }); // square

const flat = (rows: ReturnType<typeof rhythm<P>>) => rows.flatMap((r) => r.items.map((p) => p.id));

describe("rhythm (ARCHITECTURE §7.1)", () => {
  it("empty input → no rows", () => {
    expect(rhythm([])).toEqual([]);
  });

  it("preserves order and count for mixed input", () => {
    const input = [W(1), T(2), T(3), S(4), T(5), W(6), W(7), T(8), T(9), T(10), W(11), S(12)];
    const rows = rhythm(input);
    expect(flat(rows)).toEqual(input.map((p) => p.id));
  });

  it("is deterministic", () => {
    const input = Array.from({ length: 40 }, (_, i) => (i % 3 === 0 ? W(i) : i % 3 === 1 ? T(i) : S(i)));
    expect(rhythm(input)).toEqual(rhythm(input));
  });

  it("pairs consecutive talls, alternating a/b", () => {
    const rows = rhythm([T(1), T(2), T(3), T(4), T(5)]);
    expect(rows.map((r) => r.type)).toEqual(["pair", "pair", "single"]);
    expect(rows.map((r) => ("variant" in r ? r.variant : null))).toEqual(["a", "b", null]);
  });

  it("every third wide is full-bleed, others offset, sides alternate", () => {
    const rows = rhythm([W(1), W(2), W(3), W(4)]);
    expect(rows.map(rowClass)).toEqual(["r-full", "r-offset r-offset-left", "r-offset r-offset-right", "r-full"]);
  });

  it("a lone tall or a square is a single", () => {
    expect(rhythm([T(1), W(2)]).map((r) => r.type)).toEqual(["single", "full"]);
    expect(rhythm([S(1)]).map(rowClass)).toEqual(["r-single"]);
  });
});

describe("dates (DESIGN §9)", () => {
  it("meta lines use nominative month with year", () => {
    expect(monthYear("2025-06-14")).toBe("lipanj 2025.");
    expect(monthYear("2024-01-01")).toBe("siječanj 2024.");
    expect(monthYear("2024-11-30")).toBe("studeni 2024.");
  });

  it("running text uses the genitive", () => {
    expect(longDate("2025-06-14")).toBe("14. lipnja 2025.");
    expect(longDate("2025-11-02")).toBe("2. studenoga 2025.");
    expect(longDate("2025-12-24")).toBe("24. prosinca 2025.");
  });

  it("numeric month/year and year", () => {
    expect(monthYearNumeric("2025-06-14")).toBe("06/2025");
    expect(yearOf("2019-03-01")).toBe(2019);
  });

  it("rejects malformed dates", () => {
    expect(() => monthYear("2025-6-1")).toThrow();
  });
});
