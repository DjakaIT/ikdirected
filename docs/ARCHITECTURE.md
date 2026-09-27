# ARCHITECTURE

Sections: 1 Overview · 2 Tree · 3 D1 schema · 4 Bindings/env · 5 Request pipeline · 6 API ·
7 Layout algorithms · 8 Upload pipeline · 9 Media serving · 10 Public caching · 11 Purge worker ·
12 Queries worth copying · 13 Content file · 14 Seed & fixtures

---

## 1. Overview

```
 visitor ──► ikdirected.com (Cloudflare) ──► Worker: Astro 6 SSR ──► D1 (albums, photos)
                      │                                   │
                      │ /admin*, /api/admin*               └──► R2 put/delete (admin only)
                      ▼
            Cloudflare Access (email one-time PIN) ── JWT ──► verified again in middleware
 visitor ──► media.ikdirected.com ──► R2 public bucket (custom domain, CDN-cached, immutable)
 cron    ──► workers/purge (separate Worker) ──► hard-delete soft-deleted rows + R2 objects > 7 days
```

Why this shape: zero monthly cost within free tiers, no server to patch, images never touch the
app origin, auth is delegated to a hardened identity proxy but still verified in code.

Image processing happens **in the admin's browser** (resize + WebP + EXIF strip). The Worker
only validates bytes and stores them — it never decodes images (free-plan CPU budget is ~10 ms).

---

## 2. Tree (create in P0/P1; keep it)

```
astro.config.mjs        wrangler.jsonc          .dev.vars.example      migrations/0001_init.sql
src/
  middleware.ts                       # pipeline §5
  env.d.ts
  content/site.ts                     # all business facts, TODO(client) markers
  styles/ tokens.css base.css public.css admin.css
  lib/
    db/        albums.ts photos.ts audit.ts types.ts
    auth/      access.ts             # JWT verify + allowlist + dev bypass guard
    http/      errors.ts headers.ts origin.ts cache.ts json.ts
    media/     webp.ts keys.ts srcset.ts
    layout/    rhythm.ts track.ts
    text/      slug.ts plural.ts dates.ts
    seo/       jsonld.ts meta.ts
    validation/schemas.ts            # zod (import { z } from "astro/zod")
    api/       albums.ts photos.ts featured.ts upload.ts gate.ts   # handlers, see §6
  components/  Seo Nav Footer Picture Lightbox AlbumCard ChipBar YearDivider RhythmGrid ... (.astro)
  layouts/     Public.astro Admin.astro
  scripts/public/  track.ts lightbox.ts reveal.ts loader.ts cursor.ts archive.ts marquee.ts
  admin/           # Preact islands, admin only
    api.ts store.ts Toast.tsx Dialog.tsx
    AlbumList.tsx AlbumEditor.tsx PhotoGrid.tsx Uploader.tsx Featured.tsx
    image/pipeline.ts image/worker.ts image/webp-fallback.ts
  pages/
    index.astro  404.astro  sitemap.xml.ts  robots.txt.ts
    radovi/index.astro  radovi/[seg].astro          # seg = category OR album slug
    admin/index.astro  admin/albumi/[id].astro  admin/naslovnica.astro
    api/admin/albums/index.ts  api/admin/albums/[id].ts  api/admin/albums/[id]/restore.ts
    api/admin/albums/[id]/photos.ts  api/admin/albums/[id]/order.ts
    api/admin/photos/[id].ts  api/admin/photos/[id]/restore.ts
    api/admin/featured/index.ts  api/admin/featured/order.ts
    _dev/media/[...key].ts                          # DEV ONLY, see §9
workers/purge/  index.ts  wrangler.jsonc
scripts/        seed.mjs  make-fixtures.mjs  backup.md
tests/          unit/  integration/  e2e/  fixtures/
```

---

## 3. D1 schema — `migrations/0001_init.sql`

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE albums (
  id             TEXT PRIMARY KEY,                 -- crypto.randomUUID()
  slug           TEXT UNIQUE,                      -- NULL until first publish, then frozen
  title          TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  category       TEXT NOT NULL CHECK (category IN ('vjencanja','eventi','portreti','iz-zraka')),
  place          TEXT NOT NULL DEFAULT '' CHECK (length(place) <= 80),
  event_date     TEXT NOT NULL CHECK (event_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  story          TEXT NOT NULL DEFAULT '' CHECK (length(story) <= 600),
  cover_photo_id TEXT,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  published_at   TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at     TEXT
);
CREATE INDEX idx_albums_public ON albums(status, deleted_at, event_date DESC);
CREATE INDEX idx_albums_cat    ON albums(category, status, deleted_at, event_date DESC);

CREATE TABLE photos (
  id                TEXT PRIMARY KEY,
  album_id          TEXT NOT NULL REFERENCES albums(id),
  position          INTEGER NOT NULL,
  width             INTEGER NOT NULL CHECK (width  BETWEEN 1 AND 2400),   -- of the 2400 variant
  height            INTEGER NOT NULL CHECK (height BETWEEN 1 AND 2400),
  alt               TEXT NOT NULL DEFAULT '' CHECK (length(alt) <= 200),
  lqip              TEXT NOT NULL CHECK (length(lqip) <= 2000),          -- data:image/webp;base64,…
  featured          INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
  featured_position INTEGER,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at        TEXT
);
CREATE INDEX idx_photos_album    ON photos(album_id, deleted_at, position);
CREATE INDEX idx_photos_featured ON photos(featured, deleted_at, featured_position);

CREATE TABLE audit_log (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actor  TEXT NOT NULL,
  action TEXT NOT NULL,          -- album.create, album.update, album.publish, photo.upload, …
  target TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''  -- short, never user free text > 200 chars
);
CREATE INDEX idx_audit_actor_at ON audit_log(actor, at);
```

Rules: every mutation bumps `albums.updated_at`; `slug` is assigned inside the same statement
batch that sets `status='published'` for the first time; soft delete = set `deleted_at`.

---

## 4. Bindings and env — `wrangler.jsonc`

Start from what `npx astro add cloudflare` generates. Add only:

```jsonc
{
  "d1_databases": [{ "binding": "DB", "database_name": "ikdirected",
                     "database_id": "REPLACE_ME", "migrations_dir": "migrations" }],
  "r2_buckets":   [{ "binding": "MEDIA", "bucket_name": "ikdirected-media" }],
  "vars": {
    "SITE_ORIGIN": "https://ikdirected.com",            // TODO(client) real domain
    "PUBLIC_MEDIA_BASE": "https://media.ikdirected.com",
    "CF_ACCESS_TEAM_DOMAIN": "https://REPLACE_ME.cloudflareaccess.com",
    "CF_ACCESS_AUD": "REPLACE_ME",
    "ADMIN_EMAILS": "REPLACE_ME"                          // comma separated
  }
}
```
`.dev.vars.example` (committed, names only):
```
SITE_ORIGIN=http://localhost:4321
PUBLIC_MEDIA_BASE=/_dev/media
DEV_AUTH_BYPASS=1
DEV_AUTH_EMAIL=dev@example.test
ADMIN_EMAILS=dev@example.test
```
Access `env` via `import { env } from "cloudflare:workers"` (Astro 6). Generate types with
`npx wrangler types` and commit `worker-configuration.d.ts`.

---

## 5. Request pipeline — `src/middleware.ts` (order matters)

1. `requestId = crypto.randomUUID()`; start timing.
2. **Admin gate** — if path starts with `/admin` or `/api/admin`:
   a. `verifyAccess(request, env)` (SECURITY.md §3). Fail → API 401 JSON / HTML 403 page.
   b. email must be in `ADMIN_EMAILS` (case-insensitive, trimmed). Fail → 403.
   c. Mutating method (POST/PUT/PATCH/DELETE) → `Origin` must equal `SITE_ORIGIN` **and**
      `Sec-Fetch-Site` must be `same-origin` when present. Fail → 403 `ORIGIN`.
   d. `locals.user = { email }`.
3. **Edge cache** — public `GET` only, no `CF_Authorization` cookie, status 200 → `caches.default`
   (§10).
4. Call `next()`.
5. **Headers** — apply `publicHeaders` or `adminHeaders` (SECURITY.md §4) to every response,
   including errors and 404s. Add `X-Request-Id`.
6. Errors are caught once here → JSON `{ error: { code, message } }` for `/api/*`, HTML error
   page otherwise. Never include stack, SQL, or input echo. Log `requestId`, path, code.

---

## 6. API contract (all under `/api/admin`, JSON unless noted, all require §5 gate)

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | /albums | – | 200 `{albums: AlbumCard[], trash: AlbumCard[]}` | |
| POST | /albums | `{category?}` | 201 `Album` | 400 |
| GET | /albums/:id | – | 200 `Album & {photos: Photo[]}` | 404 |
| PATCH | /albums/:id | `{title?,category?,place?,event_date?,story?,status?,cover_photo_id?}` | 200 `Album` | 400, 404, 409 `PUBLISH_BLOCKED` |
| DELETE | /albums/:id | – | 204 | 404 |
| POST | /albums/:id/restore | – | 200 `Album` | 404, 409 (purged) |
| POST | /albums/:id/photos | multipart (§8.3) | 201 `Photo` | 400, 404, 409 `ALBUM_FULL`, 413, 415, 422, 429 |
| PUT | /albums/:id/order | `{ids: string[]}` exact live set | 204 | 400 (set mismatch), 404 |
| PATCH | /photos/:id | `{alt?, featured?}` | 200 `Photo` | 400, 404, 409 `FEATURED_FULL` |
| DELETE | /photos/:id | – | 204 | 404 |
| POST | /photos/:id/restore | – | 200 `Photo` (original position, shifts others) | 404 |
| GET | /featured | – | 200 `{photos: FeaturedPhoto[]}` | |
| PUT | /featured/order | `{ids: string[]}` exact featured set | 204 | 400 |

Types live in `src/lib/db/types.ts`; zod schemas in `src/lib/validation/schemas.ts` are the single
source (`z.infer`). Unknown keys → 400 (`.strict()`). IDs must match UUID v4 regex before any query.
Error codes: `VALIDATION UNAUTHORIZED FORBIDDEN ORIGIN NOT_FOUND CONFLICT PUBLISH_BLOCKED
FEATURED_FULL ALBUM_FULL UNSUPPORTED_MEDIA TOO_LARGE DIMENSION_MISMATCH RATE_LIMITED INTERNAL`.

Every successful mutation writes one `audit_log` row: `actor=locals.user.email`.

**Handler pattern (testability):** each file in `src/pages/api/admin/**` is a 3-line wrapper that
calls a handler in `src/lib/api/*.ts` with signature
`(req: Request, env: Env, user: { email: string }, params) => Promise<Response>`.
Integration tests call handlers directly inside the Workers test pool with real local D1/R2;
the same goes for `adminGate(req, env, isDev)` from middleware. E2E covers the wiring.

---

## 7. Layout algorithms (pure functions, 100 % unit-tested)

### 7.1 `rhythm(photos) → Row[]` — album page
```
ar = width / height;  kind = ar >= 1.3 ? "wide" : ar <= 0.85 ? "tall" : "square"
i = 0; wides = 0; pairs = 0
while i < n:
  p = photos[i]
  if kind(p) == "tall" and i+1 < n and kind(photos[i+1]) == "tall":
      push {type:"pair", items:[p, photos[i+1]], variant: pairs++ % 2 ? "b" : "a"}; i += 2
  else if kind(p) == "wide":
      push {type: wides % 3 == 0 ? "full" : "offset", side: wides % 2 ? "left" : "right", items:[p]}
      wides++; i++
  else:
      push {type:"single", items:[p]}; i++
```
CSS on a 12-col grid: full = 1/13 (bleeds to viewport edges); offset right = 3/13, left = 1/11;
pair a = 1/8 + 8/13 (second pushed down 12vh); pair b = 1/6 + 6/13 (first pushed down);
single = 3/11. Below 900px every row is 1/13, pair second item not offset.
Invariants to test: flatten(rows) preserves input order and count; deterministic; empty → [].

### 7.2 `trackItem(photo, index)` — home gallery
width: wide → `min(38vw, 88vw)`, tall → `min(22vw, 72vw)`, square → `min(29vw, 84vw)`;
vertical offset cycles `[-4, 6, -8, 4, -6, 8, -3, 5]` vh by index. Aspect ratio from real dims.
Implement as classes (`.t-wide .t-tall .t-square`, offsets via `:nth-child(8n+k)`) and `width`/
`height` attributes — **not** inline `style` (SECURITY §4). Same for rhythm rows (`.r-full`, `.r-pair-a`, …).

---

## 8. Upload pipeline

### 8.1 Client (`src/admin/image/*`) — per file, processing concurrency 1, upload concurrency 3
1. Reject by extension/MIME early: allow `image/jpeg image/png image/webp image/heic image/heif`;
   size ≤ 60 MB; batch ≤ 200 files.
2. Decode in a Web Worker when `OffscreenCanvas` exists, else main thread:
   `createImageBitmap(file, { imageOrientation: "from-image" })`. Failure → `up.err.decode`.
3. For targets `[2400, 1280, 640]` (long edge, never upscale): draw with
   `imageSmoothingQuality="high"`, encode `convertToBlob({type:"image/webp", quality:.86})`
   (640: .8). If a variant exceeds its server byte cap (§8.2), re-encode at quality −.06
   (max 3 steps) before giving up with `up.err.server`.
   **If the returned `blob.type !== "image/webp"`** (older Safari), lazy-load
   `@jsquash/webp` (WASM) and encode `ImageData` with it. Admin bundle only.
4. LQIP: long edge 16 px, WebP q .5 → base64 data URI (≤ 1 KB typical, hard cap 2000 chars).
5. Record `w,h` of the 2400 variant. Build `FormData` (§8.3). `XMLHttpRequest` for progress
   events (fetch has no upload progress). Retry once on network error with 2 s backoff.
6. Show local `URL.createObjectURL(v640)` thumbnail immediately; revoke on unmount.

### 8.2 Server (`POST /albums/:id/photos`)
Order: gate (§5) → rate limit (≤ 1500 uploads / actor / 24h via audit_log count → 429) →
`Content-Length` ≤ 4 MB else 413 → `formData()` → field set must be exactly
`meta, v2400, v1280, v640` → zod `meta` → per file: byte caps (2400 ≤ 2 MB, 1280 ≤ 700 KB,
640 ≤ 220 KB) → `parseWebp(bytes)` (§8.4) → dims: long edge of each = min(target, meta long edge),
aspect of all three within 1 % of meta, 2400 dims == meta dims → album exists, not deleted,
live photo count < 400 → `id = crypto.randomUUID()` → `MEDIA.put` ×3 (§9 keys/metadata) →
D1 insert (position = max+1; set cover if null) → audit → 201. If the D1 insert fails after R2
puts, delete the three objects (best effort) before returning 500.

### 8.3 Multipart fields
`meta` = JSON `{w:int, h:int, lqip:string}`; `v2400`, `v1280`, `v640` = `Blob` (`image/webp`).
The server ignores filenames and client `type` entirely.

### 8.4 `parseWebp(bytes) → {width, height} | Error` — `src/lib/media/webp.ts`
- bytes[0..3] == "RIFF", bytes[8..11] == "WEBP", little-endian RIFF size + 8 == length (± 1 pad).
- Chunk at 12: `"VP8 "` → start code `9D 01 2A` at 23..25; width = u16le@26 & 0x3FFF, height = u16le@28 & 0x3FFF.
- `"VP8L"` → byte 20 == 0x2F; b = u32le@21; width = (b & 0x3FFF)+1; height = ((b>>14) & 0x3FFF)+1.
- `"VP8X"` → flags byte 20: **reject if animation (0x02), EXIF (0x08) or XMP (0x04) bit set**;
  width = u24le@24 + 1; height = u24le@27 + 1.
- Anything else → `UNSUPPORTED_MEDIA`. Width/height 0 or > 2400 → `DIMENSION_MISMATCH`.
Fixtures for every branch in tests/fixtures (TESTING.md §4).

---

## 9. Media serving

- Bucket `ikdirected-media`, public **only** via custom domain `media.<domain>` (r2.dev disabled).
- Keys: `p/{photoId}/2400.webp`, `p/{photoId}/1280.webp`, `p/{photoId}/640.webp`. photoId is a
  UUID we generated — never user input.
- `put` options: `httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable", contentDisposition: "inline" }`.
- Response headers on the media domain via a Cloudflare Transform Rule (SETUP.md): `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cross-Origin-Resource-Policy: cross-origin`.
- LQIP renders as `<img class="lqip" src="data:image/webp;base64,…" alt="" aria-hidden="true">`
  underneath the real image (blurred via CSS `filter: blur(20px)`), removed after `decode()`.
- `srcset(photoId)` → `${BASE}/p/${id}/640.webp 640w, …1280w, …2400w`; `sizes` per component
  (track: `(max-width: 900px) 84vw, 38vw`; rhythm full: `100vw`; card: `(max-width: 640px) 100vw, 33vw`).
- **Dev only:** `src/pages/_dev/media/[...key].ts` streams from the `MEDIA` binding when
  `import.meta.env.DEV`; in production it must return 404 (test `SEC-DEV-01`). `PUBLIC_MEDIA_BASE=/_dev/media` in `.dev.vars`.

---

## 10. Public caching

`src/lib/http/cache.ts`: for public GET 200 responses set
`Cache-Control: public, max-age=0, s-maxage=120, stale-while-revalidate=600` and store in
`caches.default` (custom domain only; no-op on workers.dev/local). Bypass when the request carries
a `CF_Authorization` cookie so the photographer sees changes instantly. Admin, API and 4xx/5xx
are `no-store`. Worst-case staleness for visitors after a publish: 2 minutes (acceptable, in SPEC).

---

## 11. Purge worker — `workers/purge/`

Separate tiny Worker (no Astro), same `DB` and `MEDIA` bindings, cron `17 3 * * *`.
1. Photos with `deleted_at < now-7d` (or whose album has) → `MEDIA.delete([3 keys])` → delete rows.
2. Albums with `deleted_at < now-7d` and no remaining photos → delete rows.
3. `audit_log` rows older than 365 days → delete.
Batch 100 per run step; idempotent; logs counts only. Integration-tested with miniflare.

---

## 12. Queries worth copying

Feature a photo atomically (cap 12) — check `meta.changes === 1`, else 409 `FEATURED_FULL`:
```sql
UPDATE photos
SET featured = 1,
    featured_position = (SELECT COALESCE(MAX(featured_position),0)+1 FROM photos WHERE featured=1 AND deleted_at IS NULL)
WHERE id = ?1 AND deleted_at IS NULL AND featured = 0
  AND (SELECT COUNT(*) FROM photos WHERE featured=1 AND deleted_at IS NULL) < 12;
```
Home track (featured from published albums), then fallback covers in code if < 4:
```sql
SELECT p.*, a.slug, a.title, a.place FROM photos p JOIN albums a ON a.id = p.album_id
WHERE p.featured=1 AND p.deleted_at IS NULL AND a.status='published' AND a.deleted_at IS NULL
ORDER BY p.featured_position LIMIT 12;
```
Reorder = one `DB.batch([...UPDATE photos SET position=?1 WHERE id=?2 AND album_id=?3])` after
verifying the submitted id set equals the live set.

---

## 13. `src/content/site.ts`

Typed object with every business fact the templates print: brand, person name, email, phone,
address, geo, service list with prices, FAQ (q/a), category SEO intros, social links, area list.
Every value copied from the reference that is **not verified** keeps a `// TODO(client)` comment
on its line. Reference prices, phone, email, person name, client names in captions, the review
quote — all unverified. `tests/unit/release-gate.test.ts` (AC-REL-01) greps this file.

---

## 14. Seed and fixtures

- `scripts/make-fixtures.mjs` (devDependency `sharp`, scripts only — never imported by `src/`)
  writes `tests/fixtures/`: valid VP8, VP8L, VP8X WebPs at exact sizes; a VP8X with EXIF flag;
  an animated WebP; a JPEG renamed `.webp`; an SVG; a PNG with appended PHP payload; a
  RIFF-size-lies WebP; a 2401-px WebP; truncated file; zero-byte file.
- `scripts/seed.mjs`: creates 9 albums across 4 categories (2 drafts, 1 soft-deleted), ~60 photos
  using generated gradient WebPs with varied aspect ratios, 6 featured. Writes local D1
  (`wrangler d1 execute ikdirected --local --file …`) and local R2
  (`wrangler r2 object put ikdirected-media/<key> --file … --local`). **Every wrangler call in
  scripts must pass `--local`** — `r2 object put` targets the real bucket without it. Titles/places are obviously fake ("Testni album 3",
  "Mjesto A") — never realistic invented clients.
