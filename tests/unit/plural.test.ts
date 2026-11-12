import { describe, expect, it } from "vitest";
import { countPhotos, countStories, numberWordFeminine, plural } from "../../src/lib/text/plural";

const f = (n: number) => plural(n, "fotografija", "fotografije", "fotografija");

describe("plural (DESIGN §9)", () => {
  it.each([
    [0, "fotografija"],
    [1, "fotografija"],
    [2, "fotografije"],
    [4, "fotografije"],
    [5, "fotografija"],
    [11, "fotografija"],
    [12, "fotografija"],
    [14, "fotografija"],
    [21, "fotografija"],
    [22, "fotografije"],
    [25, "fotografija"],
    [101, "fotografija"],
    [111, "fotografija"],
  ])("%i → %s", (n, word) => {
    expect(f(n)).toBe(word);
  });

  it("uses the 'one' form for 1, 21, 101 and never for 11, 111", () => {
    expect(plural(1, "priča", "priče", "priča")).toBe("priča");
    expect(plural(21, "a", "b", "c")).toBe("a");
    expect(plural(101, "a", "b", "c")).toBe("a");
    expect(plural(11, "a", "b", "c")).toBe("c");
    expect(plural(111, "a", "b", "c")).toBe("c");
    expect(plural(13, "a", "b", "c")).toBe("c");
    expect(plural(23, "a", "b", "c")).toBe("b");
  });

  it("builds count phrases", () => {
    expect(countPhotos(84)).toBe("84 fotografije");
    expect(countPhotos(1)).toBe("1 fotografija");
    expect(countStories(3)).toBe("3 priče");
    expect(countStories(86)).toBe("86 priča");
  });

  it("names 1–12 in feminine form, digits beyond", () => {
    expect(numberWordFeminine(12)).toBe("dvanaest");
    expect(numberWordFeminine(2)).toBe("dvije");
    expect(numberWordFeminine(4)).toBe("četiri");
    expect(numberWordFeminine(13)).toBe("13");
  });
});
