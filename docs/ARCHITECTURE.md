# ARCHITECTURE

Sections: 1 Overview · 2 Tree · 3 Store · 4 Config/env · 5 Request rules · 6 API · 7 Layout algorithms ·
8 Upload pipeline · 9 Media serving · 10 Publishing · 11 Purge · 12 Local runs · 13 Content file · 14 Fixtures

Decision 2026-11-10 (Daniel): host on **Hostinger Unlimited** (the account that already hosts
CamelliaSinensis) instead of Cloudflare Workers/D1/R2/Access. The CamelliaSinensis "uredništvo" model is
reused: static site + PHP admin + publishing through GitHub Actions. Node.js apps on that plan share a
process limit across all sites and answer 503 when it is reached (CamelliaSinensis FRONTEND-ODLUKA §2),
so nothing runs Node on the hosting.

---

## 1. Overview

```
 visitor ──► https://<domain>/            LiteSpeed/Apache: public_html/*.html (Astro static build)
         ──► https://<domain>/media/p/…   public_html/media/index.php → ikdirected-podaci/media/p/<id>/<v>.webp
 admin   ──► https://<domain>/admin       static shell + Preact islands (AuthGate, screens)
              │  fetch / XHR
              ▼
         /api/admin/*  ──► public_html/api/index.php (PHP 8.1+, no DB)
              │              data + photos: <domain folder>/ikdirected-podaci/   (outside public_html)
              │  after a change (20 s quiet or "Objavi sada"): public export → GitHub branch `sadrzaj` + dispatch
              ▼
 GitHub Actions objava.yml: code from main + sadrzaj/sadrzaj.json → astro build → npm run paket → commit to branch `hosting`
              │  hPanel Git (clone of branch hosting → public_html, GitHub webhook)  
              ▼
 public_html = branch hosting. The admin's status poll sees the publish done when public_html/.ik-paket.json names
 the content commit it sent.
```

Why this shape: no monthly cost beyond the plan and the domain, nothing to keep running on the host, the
public site is plain files (fast, cacheable, no runtime to attack), the admin's data never leaves the hosting
(only the public export goes to GitHub), and deploys are hPanel's own Git integration (Daniel, 2026-11-11). hPanel's
Git deploy has no build step ("what's in the repo is what gets served") and may replace everything in
`public_html`, so the build happens on GitHub and nothing that must survive lives in `public_html`.

Image processing happens **in the admin's browser** (resize + WebP + EXIF strip). The server only parses
the WebP container and stores the bytes — it never decodes or transforms an image.

Trade-off accepted: a change is public after the build (~2 min, status shown in the admin top bar).

---

## 2. Tree

```
astro.config.mjs           output static, build.format file, security.csp, dev proxy /api /media → :8787
public/.htaccess           public_html rules: HTTPS, clean URLs, admin album rewrite, dot paths 404, headers, cache
api/                       → public_html/api/
  index.php .htaccess      front controller (PHP/extension check), everything routed here
  lib/ config base passwords users sessions limits store content media export publish app (.php)
media/                     → public_html/media/: index.php + .htaccess, the photo route (files are in the data folder)
src/
  content/site.ts          all business facts, TODO(client) markers
  lib/data/ source.ts      build-time content: IK_SADRZAJ export (validated) or demo (mock.ts)
            public.ts      read API used by pages (published content only)
  lib/ layout/ media/ seo/ text/ http/archive-path.ts
  components/ layouts/ (Public.astro, Admin.astro) scripts/public/
  admin/                   Preact, admin only: api.ts session.ts AuthGate.tsx AccountBar.tsx screens/
                           AlbumList AlbumEditor PhotoGrid Uploader Featured Dialog Toast image/ vendor/qrcode.mjs
  pages/ index 404 privatnost sitemap.xml robots.txt radovi/{index,[seg],stranica/[n],[seg]/stranica/[n]}
         admin/{index,album,naslovnica}.astro
scripts/  dev.mjs serve.mjs dev-router.php php.mjs build-local.mjs paket-hosting.mjs zip.mjs
          make-fixtures.mjs import-photos.mjs
.github/workflows/ objava.yml    (gate; build + paket → branch hosting)
tests/    unit/ php/ (API against php -S) e2e/ fixtures/
```

---

## 3. Store (`api/lib/store.php`) — `ikdirected-podaci/`

| File | Holds |
|---|---|
| `sadrzaj.json` | `{format, version, updated_at, albums[], photos[], retired_slugs[]}` — every row incl. soft-deleted |
| `povijest/*.json` | snapshot at most every 15 min, last 100 kept |
| `izvoz.json` | the public export after every change (what the next build gets) |
| `dnevnik.log` | audit: `{at, actor, ip, action, target}` per line, rotated at 1 MB |
| `korisnici.json` | users: name, role, password hash (Argon2id), TOTP secret, recovery code hashes, sessionVersion |
| `sesije/<sha256(id)>.json` | sessions |
| `ogranicenja.json` | attempt and upload counters |
| `media/p/<photoId>/{2400,1280,640}.webp` | the uploaded photos (served by `public_html/media/index.php`) |
| `objava*.json`, `osvjezi.json`, `ciscenje.json` | publishing and housekeeping state |
| `PRVO-POSTAVLJANJE.txt` | first-setup code, deleted after the first account |

Rows (unchanged from the original schema):
- **album** `id` (UUID v4) · `slug` (null until first publish, then frozen) · `title` 1–120 · `category`
  ∈ vjencanja/eventi/portreti/iz-zraka · `place` ≤ 80 · `event_date` YYYY-MM-DD · `story` ≤ 600 ·
  `cover_photo_id` · `status` draft/published · `published_at` · `created_at` · `updated_at` · `deleted_at`
- **photo** `id` · `album_id` · `position` · `width`/`height` (of the 2400 variant, 1–2400) · `alt` ≤ 200 ·
  `lqip` ≤ 2000 chars · `featured` bool · `featured_position` · `created_at` · `deleted_at`

`Store::mutate(fn)` = one exclusive lock, fresh read, `fn(&$state)`, and only when the state changed:
version + 1, atomic write, snapshot, export, publisher told. An `ApiError` inside leaves the file untouched.

---

## 4. Config and env

On the hosting nothing is configured by hand: `api/konfiguracija.json` (written by `npm run paket`) holds the
public origin; `api/lib/config.php` derives the paths (data = `dirname(public_html)/ikdirected-podaci`, photos =
`ikdirected-podaci/media`).
Env (local runs and tests only): `IK_PODACI`, `IK_MEDIA`, `IK_JAVNO`, `IK_ORIGIN`, `IK_LOKALNO=1`
(no Secure cookies, localhost hosts, first setup without the code from 127.0.0.1), `IK_TEST=1` (seed route +
per-test namespaces via cookie `ik-test-ns`), `IK_GITHUB_API`, `IK_OSVJEZI_MS`.
Build: `SITE_ORIGIN` (canonical, sitemap), `IK_SADRZAJ` (export path), `PUBLIC_MEDIA_BASE` (default `/media`).

---

## 5. Request rules (`App::handle()`)

1. Methods GET HEAD POST PUT PATCH DELETE only; `Host` must be the site (or localhost when local) → else 421.
2. Mutating requests: `Origin` = site **and** `Sec-Fetch-Site: same-origin` when present → else 403 `ORIGIN`.
3. Signed-in routes: session file valid (30 min idle, 12 h max), user exists, same `sessionVersion`
   → else 401 `UNAUTHORIZED {reason}`; mutating ones also need `X-CSRF` = session token → else 403 `FORBIDDEN`.
4. JSON bodies: `application/json`, an object, size-capped; unknown keys → 400.
5. Every answer: API headers (`App::headers()`), `Cache-Control: no-store`. Errors `{error:{code,message,…}}`;
   internal errors are 500 `INTERNAL` with no detail (logged server-side).
6. After the answer is sent: publish what waits (20 s quiet), purge the trash at most hourly.

---

## 6. API contract (all under `/api/admin`)

Content (signed in; mutating = CSRF). Unchanged from the front-end contract:

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | /albums | – | 200 `{albums: AlbumCard[], trash: AlbumCard[]}` | |
| POST | /albums | `{category?}` | 201 `Album` | 400 |
| GET | /albums/:id | – | 200 `Album & {photos: Photo[]}` | 404 |
| PATCH | /albums/:id | `{title?,category?,place?,event_date?,story?,status?,cover_photo_id?}` | 200 `Album` | 400, 404, 409 `PUBLISH_BLOCKED {reason}` |
| DELETE | /albums/:id | – | 204 | 404 |
| POST | /albums/:id/restore | – | 200 `Album` | 404, 409 (older than 7 days) |
| POST | /albums/:id/photos | multipart (§8.3) | 201 `Photo` | 400, 404, 409 `ALBUM_FULL`, 413, 415, 422, 429 |
| PUT | /albums/:id/order | `{ids}` exact live set | 204 | 400, 404 |
| PATCH | /photos/:id | `{alt?, featured?}` | 200 `Photo` | 400, 404, 409 `FEATURED_FULL` |
| DELETE | /photos/:id | – | 204 | 404 |
| POST | /photos/:id/restore | – | 200 `Photo` (original position) | 404 |
| GET | /featured | – | 200 `{photos: FeaturedPhoto[]}` | |
| PUT | /featured/order | `{ids}` exact featured set | 204 | 400 |

Sign-in and accounts:

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | /auth/state | – | `{step: in\|2fa\|setup-2fa\|null, name, role, csrf, reason, firstSetup, codeRequired?}` |
| POST | /auth/setup | `{code?, name, password}` | first account only (admin); → `{step: setup-2fa, uri, key}` |
| POST | /auth/login | `{name, password}` | → `{step: 2fa}` or setup-2fa; same 401 for unknown user and wrong password |
| POST | /auth/login/2fa | `{code}` | TOTP or a recovery code → `{step: in, name, role, csrf}` |
| POST | /auth/2fa/confirm | `{code}` | → signed in + `recoveryCodes` (shown once) |
| POST | /auth/invite/check, /auth/invite | `{token}`, `{token, password}` | invite link `/admin#pozivnica=<token>`, 72 h, single use |
| POST | /auth/logout | – | |
| POST | /auth/password | `{old, new}` | signs out other sessions |
| GET/POST | /users, /users/invite `{name, reset?}`, /users/remove `{name}` | | administrator only |
| GET | /publish | – | `{state: unconfigured\|ready\|building\|error, published, message, pending}` |
| POST | /publish/now | – | publish without waiting for the quiet window |
| GET/POST | /publish/settings | `{repo, branch, token}` | administrator only; token never returned |
| GET | /osvjezi | – | public, at most once a minute: publish what waits, finish a running publish (hPanel Cron) |

Error codes: `VALIDATION UNAUTHORIZED FORBIDDEN ORIGIN NOT_FOUND CONFLICT PUBLISH_BLOCKED FEATURED_FULL
ALBUM_FULL UNSUPPORTED_MEDIA TOO_LARGE DIMENSION_MISMATCH RATE_LIMITED INTERNAL`.
Every successful mutation writes one audit line (actor = user name).

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
`height` attributes — **not** inline `style` (SECURITY §4). Same for rhythm rows.

---

## 8. Upload pipeline

### 8.1 Client (`src/admin/image/*`) — per file, processing concurrency 1, upload concurrency 3
1. Reject by extension/MIME early: allow `image/jpeg image/png image/webp image/heic image/heif`;
   size ≤ 60 MB; batch ≤ 200 files.
2. Decode in a Web Worker when `OffscreenCanvas` exists, else main thread:
   `createImageBitmap(file, { imageOrientation: "from-image" })`. Failure → `up.err.decode`.
3. For targets `[2400, 1280, 640]` (long edge, never upscale): draw with `imageSmoothingQuality="high"`,
   encode WebP (quality .86, 640: .8); over a byte cap → re-encode −.06 (max 3 steps).
   If `blob.type !== "image/webp"` (older Safari): lazy-load `@jsquash/webp` (WASM).
4. LQIP: long edge 16 px, WebP q .5 → data URI (hard cap 2000 chars).
5. Record `w,h` of the 2400 variant; `FormData` (§8.3) over `XMLHttpRequest` (progress).
6. Show `URL.createObjectURL(v640)` immediately; revoke on unmount.

### 8.2 Server (`POST /albums/:id/photos`, `App::upload()` + `check_upload()`)
Order: signed in + CSRF → upload limit (1500 / user / 24 h → 429) → `Content-Length` ≤ 4 MB else 413 →
multipart → field set exactly `meta, v2400, v1280, v640` → meta `{w,h,lqip}` → per file byte caps
(2400 ≤ 2 MB, 1280 ≤ 700 KB, 640 ≤ 220 KB) → `parse_webp()` (§8.4) → dims: long edge of each =
min(target, meta long edge), aspect within 1 % of meta, 2400 dims == meta dims → album exists, not deleted,
live photos < 400 → new UUID → write the three files to a temp folder in `ikdirected-podaci/media/p/` and rename it into place →
`Store::mutate` adds the row (position = max + 1; cover if none) → audit → 201. If the row cannot be added,
the media folder is removed.

### 8.3 Multipart fields
`meta` = JSON `{w:int, h:int, lqip:string}`; `v2400`, `v1280`, `v640` = files. The server ignores file names
and client types entirely.

### 8.4 `parse_webp(bytes)` — `api/lib/media.php`
- `RIFF` … `WEBP`, little-endian RIFF size + 8 == length (± 1 pad) — so nothing can be appended.
- First chunk `VP8 ` (start code `9D 01 2A`, 14-bit dims), `VP8L` (signature 0x2F, 14-bit dims + 1) or
  `VP8X` (**reject animation 0x02, XMP 0x04, EXIF 0x08 flags**; 24-bit dims + 1).
- Every chunk is walked: only `VP8X ICCP ALPH VP8  VP8L`, sizes inside the file, exactly one image bitstream.
- Anything else → 415 `UNSUPPORTED_MEDIA`; width/height 0 or > 2400 → 422 `DIMENSION_MISMATCH`.

---

## 9. Media serving

- Files: `ikdirected-podaci/media/p/{photoId}/{2400,1280,640}.webp` — outside `public_html`, so a Git deploy can
  never remove them; photoId is a UUID the server generated.
- `public_html/media/` holds only `index.php` + `.htaccess` (in the package): every `/media/*` request goes to
  index.php, which answers only `/media/p/<uuid>/<640|1280|2400>.webp` (everything else 404) with
  `Content-Type: image/webp`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`,
  `Cross-Origin-Resource-Policy: same-origin`, `Content-Disposition: inline`,
  `Cache-Control: public, max-age=31536000, immutable`, ETag/Last-Modified and 304. The bytes are sent as stored.
- Same origin as the site; each image is one small PHP request (browser and CDN cache them for a year).
- `srcset` = `640w, 1280w, 2400w` with the real intrinsic widths (never upscaled); LQIP `<img>` underneath.
- Drafts' photos are reachable only by their unguessable UUID URL.

---

## 10. Publishing (`api/lib/publish.php`, `.github/workflows/objava.yml`, hPanel Git)

1. Every change marks the export pending. The next signed-in request after 20 s of quiet (the admin polls
   `/publish` every 10 s), "Objavi sada", or `/osvjezi` (Cron) pushes **only** `sadrzaj/sadrzaj.json` (the public
   export) as one commit to branch `sadrzaj` and sends `repository_dispatch sadrzaj` (run name `Objava <commit>`).
   Never during a running publish; changes made meanwhile wait for the next one.
2. `objava.yml` (job `objava`, needs `OBJAVA_UKLJUCENA = da`): main + that file → `npm run build` →
   `npm run paket` (`.ik-paket.json` records the content commit) → one commit of `hosting/` to branch `hosting`
   (rsync --delete: pages of deleted albums disappear). Without branch `sadrzaj`: an empty export, never demo
   content. A push to main runs `npm run gate` first and republishes with the current content.
3. hPanel Git (classic clone of branch `hosting` in `public_html`, GitHub push webhook) pulls the commit.
4. The status poll marks the publish done when `public_html/.ik-paket.json` names the content commit it sent; it
   reports a failed or skipped run, and an error if the build succeeded but the hosting has not pulled it after
   15 minutes. `.ik-paket.json` and `.git/` are 404 for visitors (dot paths).
5. Static pages are `Cache-Control: no-cache` (revalidate); `_astro/*` immutable.

---

## 11. Purge (`Content::purge`, at most hourly after a signed-in request)

Photos deleted > 7 days ago, and albums deleted > 7 days ago with all their photos, are removed from the store;
their media folders (in `ikdirected-podaci/media`) are deleted; a purged album's slug goes to `retired_slugs` and is never given out again.
The audit log rotates by size (≈ 2 MB total).

---

## 12. Local runs

- `npm run dev`: Astro dev (public + admin with hot reload) and `php -S :8787 scripts/dev-router.php`
  (proxied `/api`, `/media`); admin data in `.local/`. `npm run build:local && npm run preview` shows the
  public site built from that local data.
- `scripts/dev-router.php` emulates `public/.htaccess`, `media/.htaccess`, `api/.htaccess` — the security
  headers are read from the built `.htaccess` files. Keep the router and the `.htaccess` files in step.

---

## 13. `src/content/site.ts`

Typed object with every business fact the templates print: brand, person name, email, phone,
address, geo, service list with prices, FAQ (q/a), category SEO intros, social links, area list.
Every value copied from the reference that is **not verified** keeps a `// TODO(client)` comment
on its line. `tests/unit/release-gate.test.ts` (AC-REL-01) greps this file.

---

## 14. Fixtures and demo content

- `scripts/make-fixtures.mjs` writes `tests/fixtures/`: valid VP8/VP8L/VP8X triples, EXIF/XMP/animated WebPs,
  JPEG-as-WebP, SVG, PNG polyglot, appended payload, RIFF-size lie, truncated, 2401 px, empty, LQIP, and the
  camera JPEG with GPS + Orientation=6. Placeholders in `public/placeholder` (real photos since
  `scripts/import-photos.mjs`) are only rebuilt with `--force`.
- `src/lib/data/mock.ts`: demo content (33 albums, titles "Testni album N", places "Mjesto A") for builds
  without an export and for the e2e seed — never realistic invented clients.
