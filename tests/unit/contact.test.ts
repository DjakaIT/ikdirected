import { describe, expect, it } from "vitest";
import { CONTACT_MAX, cleanContact, contactMailto, isEmail, validateContact } from "../../src/lib/contact";

const labels = { ime: "Ime", prezime: "Prezime", email: "E-mail", naslov: "Naslov zahtjeva", poruka: "Poruka" };
const ok = { ime: "Ana", prezime: "Horvat", email: "ana@primjer.hr", naslov: "Vjenčanje 2027.", poruka: "Bok,\nimamo datum." };

describe("contact form rules", () => {
  it("accepts a complete form", () => {
    expect(validateContact(cleanContact(ok))).toEqual({});
  });

  it("requires every field, in form order", () => {
    const errors = validateContact(cleanContact({ ime: "  ", email: "", poruka: "\n" }));
    expect(Object.keys(errors)).toEqual(["ime", "prezime", "email", "naslov", "poruka"]);
  });

  it.each([
    ["ana@primjer.hr", true],
    ["ana.horvat+vj@mail.primjer.com", true],
    ["ana@primjer", false],
    ["ana@@primjer.hr", false],
    ["ana primjer@x.hr", false],
    ["@primjer.hr", false],
    ["ana@primjer.h", false],
  ])("isEmail(%s) → %s", (value, expected) => {
    expect(isEmail(value)).toBe(expected);
  });

  it("reports a malformed e-mail separately from a missing one", () => {
    expect(validateContact(cleanContact({ ...ok, email: "ana@" })).email).toBe("emailFormat");
    expect(validateContact(cleanContact({ ...ok, email: "" })).email).toBe("email");
  });

  it("trims and caps values at their maximum length", () => {
    const v = cleanContact({ ...ok, naslov: `  ${"x".repeat(500)}  ` });
    expect(v.naslov).toHaveLength(CONTACT_MAX.naslov);
    expect(cleanContact({ ...ok, ime: "  Ana  " }).ime).toBe("Ana");
  });

  it("builds an encoded mailto with subject and a labelled body", () => {
    const url = contactMailto("hello@ikdirected.com", cleanContact(ok), labels);
    expect(url.startsWith("mailto:hello@ikdirected.com?subject=Vjen%C4%8Danje%202027.&body=")).toBe(true);
    const body = decodeURIComponent(url.split("&body=")[1]!);
    expect(body).toBe("Ime: Ana\r\nPrezime: Horvat\r\nE-mail: ana@primjer.hr\r\n\r\nBok,\nimamo datum.");
  });

  it("cannot inject extra mailto headers through the fields", () => {
    const url = contactMailto("hello@ikdirected.com", cleanContact({ ...ok, naslov: "x&cc=evil@x.hr" }), labels);
    expect(url).not.toContain("&cc=");
  });
});
