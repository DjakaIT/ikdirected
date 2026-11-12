import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const file = join(process.cwd(), "src", "content", "site.ts");
const source = readFileSync(file, "utf8");
const markers = source
  .split("\n")
  .map((line, i) => ({ line: i + 1, text: line.trim() }))
  .filter((l) => l.text.includes("TODO(client)") && !l.text.startsWith("//"));

describe("release gate", () => {
  it("AC-REL-01 site.ts has no TODO(client) markers when RELEASE=1", () => {
    if (process.env.RELEASE === "1") {
      const list = markers.map((m) => `  site.ts:${m.line}`).join("\n");
      expect(markers, `Unverified business facts remain:\n${list}`).toHaveLength(0);
    } else {
      // Outside a release the markers are expected; the test only documents how many remain.
      expect(markers.length).toBeGreaterThanOrEqual(0);
    }
  });
});
