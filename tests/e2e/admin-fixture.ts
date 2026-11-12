// Admin e2e against the real PHP API (scripts/serve.mjs, IK_TEST=1): every test gets its own data namespace
// (cookie ik-test-ns), seeded with the demo content of src/lib/data/mock.ts and a signed-in admin "test".
// Seeded photos are shown from the placeholder images (scripts/dev-router.php, tests only).
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mockDb } from "../../src/lib/data/mock";

export { expect, test };
export type { Page };

export const TEST_USER = { name: "test", password: "test-lozinka-dovoljno-duga", totp: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP" };

function demoState() {
  return {
    format: 1,
    version: 1,
    updated_at: new Date().toISOString(),
    albums: mockDb.albums.map((a) => ({ ...a })),
    photos: mockDb.photos.map((p) => ({
      id: p.id,
      album_id: p.album_id,
      position: p.position,
      width: p.width,
      height: p.height,
      alt: p.alt,
      lqip: p.lqip,
      featured: p.featured === 1,
      featured_position: p.featured_position,
      created_at: p.created_at,
      deleted_at: p.deleted_at,
    })),
  };
}

/** fresh namespace for this page's context; signed in unless user: false */
export async function seed(page: Page, opts: { empty?: boolean; user?: boolean } = {}): Promise<string> {
  const ns = randomUUID();
  const baseURL = test.info().project.use.baseURL!;
  await page.context().addCookies([{ name: "ik-test-ns", value: ns, url: baseURL }]);
  const state = opts.empty ? { format: 1, version: 1, updated_at: null, albums: [], photos: [] } : demoState();
  const mediaMap = opts.empty ? {} : Object.fromEntries(mockDb.photos.map((p) => [p.id, p.media_id]));
  const r = await page.request.post("/api/admin/__test/seed", { data: { state, mediaMap, user: opts.user ?? true }, headers: { Origin: baseURL } });
  expect(r.status(), await r.text()).toBe(200);
  return ns;
}

/** RFC 6238 code (same as api/lib/passwords.php) */
export async function totp(secretB32: string, stepOffset = 0): Promise<string> {
  const { createHmac } = await import("node:crypto");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secretB32.replace(/[^A-Z2-7]/g, "")) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + stepOffset));
  const h = createHmac("sha1", key).update(msg).digest();
  const o = h[19]! & 15;
  const n = ((h[o]! & 127) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 1_000_000).padStart(6, "0");
}
