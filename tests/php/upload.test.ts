// Upload pipeline on the server (ARCHITECTURE §8.2–8.4, SECURITY §7, SEC-UP-*): bytes are parsed, never decoded.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, fixture, startPhp, type PhpServer } from "./harness";
import { album, LQIP, photo, state } from "./state";

let php: PhpServer;
beforeAll(async () => {
  php = await startPhp();
});
afterAll(() => php.stop());

const LAND = { meta: { w: 2400, h: 1600 }, v2400: "vp8-2400x1600.webp", v1280: "vp8-1280x853.webp", v640: "vp8-640x427.webp" };
const PORT = { meta: { w: 1600, h: 2400 }, v2400: "vp8l-1600x2400.webp", v1280: "vp8l-853x1280.webp", v640: "vp8l-427x640.webp" };
const SQUARE = { meta: { w: 2400, h: 2400 }, v2400: "vp8x-2400x2400.webp", v1280: "vp8x-1280x1280.webp", v640: "vp8x-640x640.webp" };

function form(set: typeof LAND, over: Partial<Record<"meta" | "v2400" | "v1280" | "v640", string | Buffer | null>> = {}, extra?: [string, Blob | string]): FormData {
  const f = new FormData();
  const meta = over.meta === undefined ? JSON.stringify({ ...set.meta, lqip: LQIP }) : over.meta;
  if (meta !== null) f.append("meta", meta as string);
  for (const v of ["v2400", "v1280", "v640"] as const) {
    const o = over[v];
    if (o === null) continue;
    const bytes = o === undefined ? fixture(set[v]) : typeof o === "string" ? fixture(o) : o;
    f.append(v, new Blob([new Uint8Array(bytes)], { type: "image/webp" }), "x.webp");
  }
  if (extra) f.append(extra[0], extra[1]);
  return f;
}

async function ready() {
  const a = album();
  const c = await new Client(php).seed({ state: state([a]) });
  return { c, a };
}

describe("valid uploads", () => {
  it.each([["VP8 landscape", LAND], ["VP8L portrait", PORT], ["VP8X square (alpha, no metadata)", SQUARE]])(
    "AC-UP-01 %s → 201; becomes the cover; default alt from title and place",
    async (_n, set) => {
      const { c, a } = await ready();
      const r = await c.req("POST", `/api/admin/albums/${a.id}/photos`, { form: form(set) });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ album_id: a.id, position: 1, width: set.meta.w, height: set.meta.h, alt: "Testni album, Mjesto A", featured: false });
      const d = await c.req("GET", `/api/admin/albums/${a.id}`);
      expect(d.body.cover_photo_id).toBe(r.body.id);
    },
  );

  it("SEC-UP-10 the three variants are stored under the generated id and served as image/webp with nosniff + sandbox", async () => {
    const { c, a } = await ready();
    const r = await c.req("POST", `/api/admin/albums/${a.id}/photos`, { form: form(LAND) });
    const id: string = r.body.id;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    for (const v of [2400, 1280, 640]) {
      const file = join(c.mediaDir, "p", id, `${v}.webp`);
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file).equals(fixture(LAND[`v${v}` as "v640"]))).toBe(true);
    }
    const res = await fetch(`${php.base}/media/p/${id}/640.webp`, { headers: { Cookie: `ik-test-ns=${c.ns}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect((await fetch(`${php.base}/media/p/${id}/641.webp`)).status).toBe(404);
    expect((await fetch(`${php.base}/media/.htaccess`)).status).toBe(404);
  });

  it("a small photo is never upscaled: all three variants keep its size", async () => {
    const { c, a } = await ready();
    const f = form(LAND, { meta: JSON.stringify({ w: 640, h: 427, lqip: LQIP }), v2400: "vp8-640x427.webp", v1280: "vp8-640x427.webp" });
    expect((await c.req("POST", `/api/admin/albums/${a.id}/photos`, { form: f })).status).toBe(201);
  });
});

describe("refused uploads", () => {
  it.each([
    ["SEC-UP-01 SVG bytes", "image.svg"],
    ["SEC-UP-02 JPEG bytes in a .webp part", "jpeg-as-webp.webp"],
    ["SEC-UP-03 PNG with an appended script", "polyglot.png"],
    ["SEC-UP-03 WebP with an appended payload", "appended.webp"],
    ["SEC-UP-04 RIFF size lies", "riff-lie.webp"],
    ["SEC-UP-04 truncated file", "truncated.webp"],
    ["SEC-UP-05 animated WebP", "animated.webp"],
    ["SEC-UP-06 VP8X with EXIF", "vp8x-exif.webp"],
    ["SEC-UP-06 VP8X with XMP", "vp8x-xmp.webp"],
    ["empty file", "empty.bin"],
  ])("%s → 415 UNSUPPORTED_MEDIA", async (_n, bad) => {
    const { c, a } = await ready();
    const r = await c.req("POST", `/api/admin/albums/${a.id}/photos`, { form: form(LAND, { v640: bad }) });
    expect(r.status).toBe(415);
    expect(r.body.error.code).toBe("UNSUPPORTED_MEDIA");
    expect((await c.req("GET", `/api/admin/albums/${a.id}`)).body.photos).toHaveLength(0);
  });

  it("SEC-UP-07 a variant over its byte cap → 413; the whole request over 4 MB → 413", async () => {
    const { c, a } = await ready();
    const big = Buffer.concat([fixture("vp8-640x427.webp"), Buffer.alloc(230 * 1024)]);
    expect((await c.req("POST", `/api/admin/albums/${a.id}/photos`, { form: form(LAND, { v640: big }) })).status).toBe(413);
    const huge = form(LAND, {}, ["pad", new Blob([new Uint8Array(4 * 1024 * 1024 + 10)])]);
    expect((await c.req("POST", `/api/admin/albums/${a.id}/photos`, { form: huge })).status).toBe(413);
  });

  it("SEC-UP-08 dimensions that disagree with meta or each other → 422; over 2400 px → 422", async () => {
    const { c, a } = await ready();
    const cases = [
      form(LAND, { meta: JSON.stringify({ w: 2400, h: 1500, lqip: LQIP }) }),
      form(LAND, { v1280: "vp8l-853x1280.webp" }),
      form(LAND, { v2400: "vp8-1280x853.webp" }),
      form(LAND, { v2400: "too-big-2401.webp", meta: JSON.stringify({ w: 2400, h: 1600, lqip: LQIP }) }),
    ];
    for (const f of cases) {
      const r = await c.req("POST", `/api/admin/albums/${a.id}/photos`, { form: f });
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe("DIMENSION_MISMATCH");
    }
  });

  it("SEC-UP-09 missing or extra fields, bad meta → 400", async () => {
    const { c, a } = await ready();
    const cases = [
      form(LAND, { v640: null }),
      form(LAND, { meta: null }),
      form(LAND, {}, ["extra", "x"]),
      form(LAND, {}, ["v320", new Blob([new Uint8Array(fixture("vp8-640x427.webp"))])]),
      form(LAND, { meta: "nije json" }),
      form(LAND, { meta: JSON.stringify({ w: 2400, h: 1600 }) }),
      form(LAND, { meta: JSON.stringify({ w: 2400, h: 1600, lqip: "data:image/png;base64,AAAA" }) }),
      form(LAND, { meta: JSON.stringify({ w: 2400, h: 1600, lqip: LQIP, extra: 1 }) }),
    ];
    for (const f of cases) expect((await c.req("POST", `/api/admin/albums/${a.id}/photos`, { form: f })).status).toBe(400);
    expect((await c.req("POST", `/api/admin/albums/${a.id}/photos`, { json: {} })).status).toBe(400);
  });

  it("unknown or deleted album → 404; a full album (400 photos) → 409 ALBUM_FULL", async () => {
    const full = album();
    const gone = album({ deleted_at: new Date().toISOString() });
    const photos = Array.from({ length: 400 }, (_, i) => photo(full.id, i + 1));
    const c = await new Client(php).seed({ state: state([full, gone], photos) });
    expect((await c.req("POST", `/api/admin/albums/${gone.id}/photos`, { form: form(LAND) })).status).toBe(404);
    const r = await c.req("POST", `/api/admin/albums/${full.id}/photos`, { form: form(LAND) });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("ALBUM_FULL");
  });

  it("SEC-RATE-01 the 1501st upload in 24 h for one user → 429", async () => {
    const { c, a } = await ready();
    const now = Date.now();
    writeFileSync(join(c.dataDir, "ogranicenja.json"), JSON.stringify({ "upload:test": Array.from({ length: 1500 }, (_, i) => now - i * 1000) }));
    const r = await c.req("POST", `/api/admin/albums/${a.id}/photos`, { form: form(LAND) });
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe("RATE_LIMITED");
  });
});
