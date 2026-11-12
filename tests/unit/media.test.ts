import { describe, expect, it } from "vitest";
import { kindOf, trackClass } from "../../src/lib/layout/track";
import { mediaUrl, srcset, variantWidth } from "../../src/lib/media/srcset";
import { jsonLdString } from "../../src/lib/seo/jsonld";

describe("srcset", () => {
  it("builds keys per ARCHITECTURE §9", () => {
    expect(mediaUrl("https://media.x.hr/", "abc", 640)).toBe("https://media.x.hr/p/abc/640.webp");
  });

  it("uses real intrinsic widths for portrait photos", () => {
    const portrait = { mediaId: "p", width: 1600, height: 2400 };
    expect(variantWidth(portrait, 2400)).toBe(1600);
    expect(variantWidth(portrait, 1280)).toBe(853);
    expect(variantWidth(portrait, 640)).toBe(427);
    expect(srcset("/m", portrait)).toBe("/m/p/p/640.webp 427w, /m/p/p/1280.webp 853w, /m/p/p/2400.webp 1600w");
  });

  it("never upscales and drops duplicate widths for small originals", () => {
    const small = { mediaId: "s", width: 1000, height: 800 };
    expect(variantWidth(small, 2400)).toBe(1000);
    expect(variantWidth(small, 1280)).toBe(1000);
    expect(srcset("/m", small)).toBe("/m/p/s/640.webp 640w, /m/p/s/1280.webp 1000w");
  });
});

describe("track layout (ARCHITECTURE §7.2)", () => {
  it("classifies by aspect ratio", () => {
    expect(kindOf(2400, 1600)).toBe("wide");
    expect(kindOf(1300, 1000)).toBe("wide");
    expect(kindOf(1920, 2400)).toBe("tall");
    expect(kindOf(850, 1000)).toBe("tall");
    expect(kindOf(1000, 1000)).toBe("square");
    expect(kindOf(1200, 1000)).toBe("square");
    expect(trackClass(2400, 1350)).toBe("t-wide");
  });
});

describe("JSON-LD escape", () => {
  it("SEC-XSS-01 neutralises </script> and comment openers", () => {
    const out = jsonLdString({ name: "</script><script>alert(1)</script><!--" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual({ name: "</script><script>alert(1)</script><!--" });
  });
});
