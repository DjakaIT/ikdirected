import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS, slugify, uniqueSlug } from "../../src/lib/text/slug";

describe("slugify (AC-ALBED-02)", () => {
  it("transliterates č ć đ š ž", () => {
    expect(slugify("Čćđšž ČĆĐŠŽ")).toBe("ccdsz-ccdsz");
    expect(slugify("Vjenčanje u Šibeniku")).toBe("vjencanje-u-sibeniku");
    expect(slugify("Đurđevdan")).toBe("durdevdan");
    expect(slugify("Džamija")).toBe("dzamija");
  });

  it("collapses spaces and punctuation", () => {
    expect(slugify("  Ana   i  Marko — Nin, 2025.  ")).toBe("ana-i-marko-nin-2025");
    expect(slugify("Rock'n'roll & jazz!!!")).toBe("rock-n-roll-jazz");
  });

  it("never returns an empty slug", () => {
    expect(slugify("!!!")).toBe("album");
  });

  it("caps length without a trailing dash", () => {
    const s = slugify("a ".repeat(100));
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("uniqueSlug", () => {
  it("avoids reserved words", () => {
    for (const r of RESERVED_SLUGS) expect(uniqueSlug(r, new Set())).toBe(`${r}-2`);
    expect(uniqueSlug("Iz zraka", new Set())).toBe("iz-zraka-2");
    expect(uniqueSlug("Admin", new Set())).toBe("admin-2");
  });

  it("appends -2, -3 on collisions", () => {
    expect(uniqueSlug("Ana i Marko", new Set())).toBe("ana-i-marko");
    expect(uniqueSlug("Ana i Marko", new Set(["ana-i-marko"]))).toBe("ana-i-marko-2");
    expect(uniqueSlug("Ana i Marko", new Set(["ana-i-marko", "ana-i-marko-2"]))).toBe("ana-i-marko-3");
  });
});
