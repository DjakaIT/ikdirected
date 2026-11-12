// Admin content API (ARCHITECTURE §6, SECURITY §6) against the real PHP backend.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, startPhp, type PhpServer } from "./harness";
import { album, DAY, iso, photo, published, state } from "./state";

let php: PhpServer;
beforeAll(async () => {
  php = await startPhp();
});
afterAll(() => php.stop());

const A = "00000000-0000-4000-8000-000000000001";
const P = "00000000-0000-4000-8000-000000000002";
const ROUTES: Array<[string, string, unknown?]> = [
  ["GET", "/api/admin/albums"],
  ["POST", "/api/admin/albums", {}],
  ["GET", `/api/admin/albums/${A}`],
  ["PATCH", `/api/admin/albums/${A}`, { title: "x" }],
  ["DELETE", `/api/admin/albums/${A}`],
  ["POST", `/api/admin/albums/${A}/restore`],
  ["PUT", `/api/admin/albums/${A}/order`, { ids: [] }],
  ["PATCH", `/api/admin/photos/${P}`, { alt: "x" }],
  ["DELETE", `/api/admin/photos/${P}`],
  ["POST", `/api/admin/photos/${P}/restore`],
  ["GET", "/api/admin/featured"],
  ["PUT", "/api/admin/featured/order", { ids: [] }],
  ["GET", "/api/admin/publish"],
  ["POST", "/api/admin/publish/now"],
];

describe("gate on every route", () => {
  it.each(ROUTES)("SEC-AUTH-01 %s %s without a session → 401", async (method, path, json) => {
    const c = await new Client(php).seed({ user: false });
    const r = await c.req(method, path, json === undefined ? {} : { json });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("UNAUTHORIZED");
  });

  it.each(ROUTES.filter(([m]) => m !== "GET"))("SEC-CSRF-01 %s %s from a foreign Origin → 403 ORIGIN", async (method, path, json) => {
    const c = await new Client(php).seed();
    const r = await c.req(method, path, { ...(json === undefined ? {} : { json }), origin: "https://napadac.example" });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("ORIGIN");
  });

  it.each(ROUTES.filter(([m]) => m !== "GET"))("SEC-CSRF-02 %s %s without the CSRF token → 403", async (method, path, json) => {
    const c = await new Client(php).seed();
    const r = await c.req(method, path, { ...(json === undefined ? {} : { json }), csrf: false });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("FORBIDDEN");
  });

  it("SEC-HDR-01 API answers carry the API headers, also on errors", async () => {
    const c = await new Client(php).seed();
    const r = await c.req("PATCH", `/api/admin/albums/nije-uuid`, { json: {} });
    expect(r.status).toBe(400);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("SEC-ERR-01 an internal error is 500 INTERNAL without details", async () => {
    const c = await new Client(php).seed();
    writeFileSync(join(c.dataDir, "sadrzaj.json"), "{ ovo nije json");
    const r = await c.req("GET", "/api/admin/albums");
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: { code: "INTERNAL", message: "Greška na poslužitelju." } });
  });
});

describe("albums", () => {
  it("AC-ALBL-02 POST creates a draft “Novi album” today in the given category; unknown keys → 400", async () => {
    const c = await new Client(php).seed();
    const r = await c.req("POST", "/api/admin/albums", { json: { category: "eventi" } });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ title: "Novi album", category: "eventi", status: "draft", slug: null, event_date: new Date().toISOString().slice(0, 10) });
    expect((await c.req("POST", "/api/admin/albums", { json: { category: "eventi", slug: "x" } })).status).toBe(400);
    expect((await c.req("POST", "/api/admin/albums", { json: { category: "rodjendani" } })).status).toBe(400);
    expect((await c.req("POST", "/api/admin/albums", { json: [] })).status).toBe(400);
  });

  it("PATCH validates title, place, date and story; collapses whitespace", async () => {
    const { a, ps } = published(2);
    const c = await new Client(php).seed({ state: state([a], ps) });
    const bad = [{ title: "" }, { title: "x".repeat(121) }, { title: "a\u0007b" }, { place: "x".repeat(81) }, { event_date: "2026-02-30" },
      { event_date: "1999-12-31" }, { event_date: "2099-01-01" }, { story: "x".repeat(601) }, { category: "x" }, { status: "x" }, { cover_photo_id: P }, { slug: "x" }];
    for (const json of bad) expect((await c.req("PATCH", `/api/admin/albums/${a.id}`, { json })).status, JSON.stringify(json)).toBe(400);
    const ok = await c.req("PATCH", `/api/admin/albums/${a.id}`, { json: { title: "  Ana   i  Marko ", place: " Nin ", story: "Prvi red\nDrugi red " } });
    expect(ok.body).toMatchObject({ title: "Ana i Marko", place: "Nin", story: "Prvi red\nDrugi red" });
  });

  it("AC-ALBED-03 publish needs a photo and a real title; first publish freezes a unique slug", async () => {
    const empty = album({ title: "Ljeto u Ninu" });
    const untitled = album({ title: "Novi album" });
    const other = album({ slug: "ljeto-u-ninu", status: "published", published_at: iso() });
    const c = await new Client(php).seed({ state: state([empty, untitled, other], [photo(untitled.id, 1), photo(other.id, 1)]) });
    const noPhotos = await c.req("PATCH", `/api/admin/albums/${empty.id}`, { json: { status: "published" } });
    expect(noPhotos.status).toBe(409);
    expect(noPhotos.body.error).toMatchObject({ code: "PUBLISH_BLOCKED", reason: "noPhotos" });
    const noTitle = await c.req("PATCH", `/api/admin/albums/${untitled.id}`, { json: { status: "published" } });
    expect(noTitle.body.error.reason).toBe("noTitle");

    await c.req("PATCH", `/api/admin/albums/${untitled.id}`, { json: { title: "Ljeto u Ninu" } });
    const pub = await c.req("PATCH", `/api/admin/albums/${untitled.id}`, { json: { status: "published" } });
    expect(pub.body.slug).toBe("ljeto-u-ninu-2");
    await c.req("PATCH", `/api/admin/albums/${untitled.id}`, { json: { status: "draft" } });
    await c.req("PATCH", `/api/admin/albums/${untitled.id}`, { json: { title: "Drugo ime" } });
    const again = await c.req("PATCH", `/api/admin/albums/${untitled.id}`, { json: { status: "published" } });
    expect(again.body.slug).toBe("ljeto-u-ninu-2");
  });

  it("slugs never take a reserved word and transliterate Croatian letters", async () => {
    const a = album({ title: "Vjenčanja" });
    const b = album({ title: "Đurđa i Željko — Šibenik, 2025." });
    const c2 = album({ title: "Stranica" });
    const c = await new Client(php).seed({ state: state([a, b, c2], [photo(a.id, 1), photo(b.id, 1), photo(c2.id, 1)]) });
    expect((await c.req("PATCH", `/api/admin/albums/${a.id}`, { json: { status: "published" } })).body.slug).toBe("vjencanja-2");
    expect((await c.req("PATCH", `/api/admin/albums/${b.id}`, { json: { status: "published" } })).body.slug).toBe("durda-i-zeljko-sibenik-2025");
    expect((await c.req("PATCH", `/api/admin/albums/${c2.id}`, { json: { status: "published" } })).body.slug).toBe("stranica-2");
  });

  it("SEC-SQL-01 / SEC-XSS-01 hostile text is stored verbatim (escaping is the renderer's job)", async () => {
    const { a, ps } = published(1);
    const c = await new Client(php).seed({ state: state([a], ps) });
    const title = `'; DROP TABLE albums; -- <script>alert(1)</script>`;
    const story = `" OR 1=1 -- "><img src=x onerror=alert(1)> </script><script>`;
    const r = await c.req("PATCH", `/api/admin/albums/${a.id}`, { json: { title, story } });
    expect(r.body).toMatchObject({ title, story });
    expect((await c.req("GET", "/api/admin/albums")).body.albums).toHaveLength(1);
  });

  it("AC-ALBED-08 delete → trash → restore; after 7 days restore is a 409", async () => {
    const fresh = album({ title: "Svjež" });
    const old = album({ title: "Star", deleted_at: iso(8 * DAY) });
    const c = await new Client(php).seed({ state: state([fresh, old]) });
    writeFileSync(join(c.dataDir, "ciscenje.json"), JSON.stringify({ at: Date.now() })); // purge not due yet: the row is still there
    expect((await c.req("DELETE", `/api/admin/albums/${fresh.id}`)).status).toBe(204);
    const list = await c.req("GET", "/api/admin/albums");
    expect(list.body.albums).toHaveLength(0);
    expect(list.body.trash.map((x: { title: string }) => x.title)).toEqual(["Svjež"]);
    expect((await c.req("GET", `/api/admin/albums/${fresh.id}`)).status).toBe(404);
    expect((await c.req("POST", `/api/admin/albums/${fresh.id}/restore`)).status).toBe(200);
    expect((await c.req("POST", `/api/admin/albums/${old.id}/restore`)).status).toBe(409);
    expect((await c.req("POST", `/api/admin/albums/${A}/restore`)).status).toBe(404);
  });
});

describe("photos", () => {
  it("AC-ALBED-05 reorder needs exactly the live set (SEC-IDOR-01)", async () => {
    const { a, ps } = published(3);
    const { a: b, ps: bps } = published(1, { slug: "drugi" });
    const c = await new Client(php).seed({ state: state([a, b], [...ps, ...bps]) });
    const ids = ps.map((p) => p.id);
    expect((await c.req("PUT", `/api/admin/albums/${a.id}/order`, { json: { ids: [ids[0], ids[1]] } })).status).toBe(400);
    expect((await c.req("PUT", `/api/admin/albums/${a.id}/order`, { json: { ids: [ids[0], ids[1], bps[0]!.id] } })).status).toBe(400);
    expect((await c.req("PUT", `/api/admin/albums/${a.id}/order`, { json: { ids: [ids[0], ids[0], ids[1]] } })).status).toBe(400);
    expect((await c.req("PUT", `/api/admin/albums/${a.id}/order`, { json: { ids: [ids[2], ids[0], ids[1]] } })).status).toBe(204);
    const d = await c.req("GET", `/api/admin/albums/${a.id}`);
    expect(d.body.photos.map((p: { id: string }) => p.id)).toEqual([ids[2], ids[0], ids[1]]);
    expect(d.body.photos[0].thumb).toBe(`/media/p/${ids[2]}/640.webp`);
  });

  it("AC-DEL-01/03 delete a photo then restore it to its place; deleting the cover moves the cover", async () => {
    const { a, ps } = published(3);
    const c = await new Client(php).seed({ state: state([a], ps) });
    expect((await c.req("DELETE", `/api/admin/photos/${ps[0]!.id}`)).status).toBe(204);
    let d = await c.req("GET", `/api/admin/albums/${a.id}`);
    expect(d.body.cover_photo_id).toBe(ps[1]!.id);
    expect(d.body.photos).toHaveLength(2);
    expect((await c.req("POST", `/api/admin/photos/${ps[0]!.id}/restore`)).status).toBe(200);
    d = await c.req("GET", `/api/admin/albums/${a.id}`);
    expect(d.body.photos.map((p: { id: string }) => p.id)).toEqual(ps.map((p) => p.id));
    expect((await c.req("POST", `/api/admin/photos/${P}/restore`)).status).toBe(404);
  });

  it("AC-FEAT-02 at most 12 on the homepage; removing renumbers; deleting unfeatures", async () => {
    const { a, ps } = published(13);
    const c = await new Client(php).seed({ state: state([a], ps) });
    for (let i = 0; i < 12; i++) expect((await c.req("PATCH", `/api/admin/photos/${ps[i]!.id}`, { json: { featured: true } })).body.featured_position).toBe(i + 1);
    const full = await c.req("PATCH", `/api/admin/photos/${ps[12]!.id}`, { json: { featured: true } });
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe("FEATURED_FULL");
    await c.req("PATCH", `/api/admin/photos/${ps[0]!.id}`, { json: { featured: false } });
    await c.req("DELETE", `/api/admin/photos/${ps[1]!.id}`);
    const f = await c.req("GET", "/api/admin/featured");
    expect(f.body.photos).toHaveLength(10);
    expect(f.body.photos.map((p: { featured_position: number }) => p.featured_position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(f.body.photos[0]).toMatchObject({ album_title: "Testni album", album_status: "published", album_slug: "testni-album" });
    const order = f.body.photos.map((p: { id: string }) => p.id).reverse();
    expect((await c.req("PUT", "/api/admin/featured/order", { json: { ids: order } })).status).toBe(204);
    expect((await c.req("GET", "/api/admin/featured")).body.photos[0].id).toBe(order[0]);
    expect((await c.req("PUT", "/api/admin/featured/order", { json: { ids: order.slice(1) } })).status).toBe(400);
  });

  it("alt text is validated and trimmed", async () => {
    const { a, ps } = published(1);
    const c = await new Client(php).seed({ state: state([a], ps) });
    expect((await c.req("PATCH", `/api/admin/photos/${ps[0]!.id}`, { json: { alt: "x".repeat(201) } })).status).toBe(400);
    expect((await c.req("PATCH", `/api/admin/photos/${ps[0]!.id}`, { json: { alt: 1 } })).status).toBe(400);
    expect((await c.req("PATCH", `/api/admin/photos/${ps[0]!.id}`, { json: { alt: "  Mladenci na rivi " } })).body.alt).toBe("Mladenci na rivi");
  });

  it("purge: albums and photos deleted more than 7 days ago go for good, their slug is never reused", async () => {
    const { a, ps } = published(2, { slug: "staro-ime", deleted_at: iso(8 * DAY) });
    const { a: b, ps: bps } = published(2, { slug: "zivi" });
    bps[1]!.deleted_at = iso(9 * DAY);
    const newer = album({ title: "Staro ime" });
    const c = await new Client(php).seed({ state: state([a, b, newer], [...ps, ...bps, photo(newer.id, 1)]) });
    await c.req("GET", "/api/admin/albums"); // purge runs after a signed-in request
    const list = await c.req("GET", "/api/admin/albums");
    expect(list.body.trash).toHaveLength(0);
    expect((await c.req("POST", `/api/admin/photos/${bps[1]!.id}/restore`)).status).toBe(404);
    expect((await c.req("PATCH", `/api/admin/albums/${newer.id}`, { json: { status: "published" } })).body.slug).toBe("staro-ime-2");
  });
});
