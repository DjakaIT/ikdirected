import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const stylesDir = join(process.cwd(), "src", "styles");
const cssFiles = readdirSync(stylesDir).filter((f) => f.endsWith(".css"));

/** The value a size can shrink to: the first argument of clamp(), otherwise the value itself. */
function floorOf(value: string): string {
  const clamp = /^clamp\(\s*([^,]+),/.exec(value.trim());
  return clamp?.[1] ?? value;
}

/** rem/px floors of every font-size or --t-* declaration, in px (1rem = 16px). */
function sizesIn(css: string): Array<{ decl: string; px: number }> {
  const out: Array<{ decl: string; px: number }> = [];
  const declRe = /(font-size|--t-[\w-]+)\s*:\s*([^;]+);/g;
  for (const m of css.matchAll(declRe)) {
    const value = m[2] ?? "";
    for (const n of floorOf(value).matchAll(/(\d*\.?\d+)(rem|px)\b/g)) {
      const num = Number(n[1]);
      out.push({ decl: `${m[1]}: ${value.trim()}`, px: n[2] === "rem" ? num * 16 : num });
    }
  }
  return out;
}

describe("design tokens", () => {
  it("AC-A11Y-04 no text size below .75rem (12px) in src/styles", () => {
    expect(cssFiles.length).toBeGreaterThan(0);
    for (const file of cssFiles) {
      const css = readFileSync(join(stylesDir, file), "utf8");
      for (const s of sizesIn(css)) {
        expect(s.px, `${file} → ${s.decl}`).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it("tokens.css defines the meta floor as .75rem", () => {
    const css = readFileSync(join(stylesDir, "tokens.css"), "utf8");
    expect(css).toMatch(/--t-meta:\s*0?\.75rem/);
  });
});
