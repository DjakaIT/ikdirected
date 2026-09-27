# PLAN

Work top to bottom. One task = one pass of the build loop = usually one commit.
**Load:** = the only doc sections to open. `ref L1–L2` = Read reference/atelier.html with offset/limit.
Every phase ends with the gate: `npm run gate` green → `git push -u origin build/atelier-cms`.

**Allowed dependencies** (anything else → record in PROGRESS Decisions with a reason first):
runtime `astro @astrojs/cloudflare @astrojs/preact preact @preact/signals jose sortablejs @jsquash/webp` ·
dev `typescript @astrojs/check wrangler vitest @cloudflare/vitest-pool-workers @playwright/test
@axe-core/playwright eslint typescript-eslint eslint-plugin-astro prettier prettier-plugin-astro sharp`
(+ `piexifjs` only if sharp cannot write GPS EXIF for the privacy fixture).

---

### P0 — Bootstrap

**P0.1 Scaffold on the branch**
Load: CLAUDE.md (already in context).
Do: `git fetch; git checkout build/atelier-cms || git checkout -b build/atelier-cms`. Scaffold Astro 6
minimal TS-strict into the existing repo without overwriting `CLAUDE.md docs/ reference/ .claude/`.
`npx astro add cloudflare preact`. `.npmrc` → `save-exact=true`. Record installed versions.
Test: `npx astro build` succeeds.
Commit: `chore: scaffold astro 6 with cloudflare adapter and preact`

**P0.2 Bindings and env**
Load: ARCHITECTURE §4, SECURITY §8.
Do: wrangler.jsonc bindings/vars, `workers_dev:false`, `preview_urls:false`; `.dev.vars.example`;
`npx wrangler types`; `astro.config.mjs`: output server, adapter, passthrough image service,
Preact integration limited to `src/admin/**` (`include`).
Test: integration smoke — `env.DB` answers `SELECT 1`, `env.MEDIA.put/get` round-trip.
Commit: `chore: wire d1, r2 and env types`

**P0.3 Tooling and scripts**
Load: TESTING §1–3, CLAUDE.md commands.
Do: tsconfig strict (+ `noUncheckedIndexedAccess`), eslint + prettier (astro plugins), vitest two
projects, playwright 3 projects + webServer, all `npm run` scripts from CLAUDE.md, `.gitignore`
(`.dev.vars`, `.wrangler/`, `dist/`, `test-results/`, `playwright-report/`).
Test: one unit, one workers, one e2e smoke (`/` returns 200 and has `lang="hr"`).
Commit: `chore: add typescript, lint, vitest and playwright tooling`

**P0.4 CI**
Load: TESTING §8.
Do: `.github/workflows/ci.yml`.
Commit: `ci: run gate and audit on build branches` → **GATE P0**

---

### P1 — Design system and static home (no DB yet)

**P1.1 Tokens, base, fonts**
Load: DESIGN §2, §4 (PD-01..03, PD-13); ref 66–101.
Do: `src/styles/tokens.css`, `base.css` (reset, skip link, `.m`, focus ring, grain), Astro Fonts API
(Archivo variable wght+wdth, Space Mono 400; latin + latin-ext; preload Archivo only).
Test: unit — token file contains no text size below .75rem (regex over css).
Commit: `feat(ui): design tokens, base styles and fonts`

**P1.2 Public layout, SEO head, nav, footer**
Load: DESIGN §3 map; ref 17–58, 222–231, 404–420; SPEC AC-SEO-01.
Do: `layouts/Public.astro`, `components/Seo.astro` (title, description, canonical, OG, geo meta),
`Nav.astro`, `Footer.astro`. Landmarks per DESIGN §8.
Test: e2e — one H1, landmarks present, canonical correct.
Commit: `feat(ui): public layout, seo head, nav and footer`

**P1.3 Content file and release gate**
Load: ARCHITECTURE §13; SPEC AC-REL-01; ref 331–401 (copy only), 429–486.
Do: `src/content/site.ts` with every business fact from the reference, each unverified value
marked `// TODO(client)`. `tests/unit/release-gate.test.ts`.
Test: AC-REL-01 passes normally, fails with `RELEASE=1`.
Commit: `feat(content): site facts with client placeholders and release gate`

**P1.4 Fixtures script (placeholders first)**
Load: TESTING §4; ARCHITECTURE §14.
Do: `scripts/make-fixtures.mjs` — generate **all** fixtures in TESTING §4 now (needed later), incl.
`public/placeholder/*.webp`. For the GPS JPEG use sharp `withExif` (check installed typings for a
GPS IFD); if impossible, add `piexifjs` and record the decision.
Test: unit — every fixture exists, byte signatures as expected.
Commit: `test: fixture generator for webp, attack files and placeholders`

**P1.5 Home sections (static)**
Load: DESIGN §4 (PD-05,06,10,11,12,14), §5.1, §9 public; ref 103–128, 155–204, 232–255, 331–401.
Do: Hero, Say (word reveal), Services stack, Area, Marquee, FAQ as Astro components fed from
site.ts + placeholder images. Scripts in `src/scripts/public/` (loader, reveal, marquee).
Test: e2e — reduced motion shows full text & no loader; JS-disabled page readable; axe home.
Commit: `feat(home): hero, statement, services, area, faq sections`

**P1.6 Gallery track, lightbox, cursor**
Load: DESIGN §4 (PD-04,07,08,15), §7, §8; ARCHITECTURE §7.2; ref 129–154, 205–218, 256–262
(first figure only), 421–427, 493–515, 532–566.
Do: `Track.astro` + `scripts/public/track.ts` (lerp, counter, keys, end card), `Lightbox.astro` +
`lightbox.ts` (dialog, inert, focus return, swipe, album link slot), `cursor.ts` (native cursor kept).
Test: e2e AC-LB-01/02, keyboard ←/→ on track, AC-HOME-06 (JS off), budgets spec (JS ≤ 30 KB).
Commit: `feat(home): horizontal gallery, lightbox and cursor`

**P1.7 404**
Load: DESIGN §5.4, §9.
Commit: `feat(ui): 404 page` → **GATE P1**

---

### P2 — Data layer

**P2.1 Migration** — Load: ARCHITECTURE §3. Do: `migrations/0001_init.sql`; test setup applies
migrations + resets. Test: tables/indexes exist; CHECK constraints reject bad category/date.
Commit: `feat(db): initial schema`

**P2.2 Text utils** — Load: DESIGN §9 (plural, months), SPEC AC-ALBED-02. Do: `slug.ts plural.ts
dates.ts`. Test: unit list in TESTING §6. Commit: `feat(lib): slug, plural and date helpers`

**P2.3 Schemas** — Load: SECURITY §5, ARCHITECTURE §6. Do: zod schemas + inferred types.
Test: strict unknown keys, control chars, date range. Commit: `feat(lib): validation schemas`

**P2.4 WebP parser** — Load: ARCHITECTURE §8.4. Test: every fixture branch.
Commit: `feat(media): structural webp parser`

**P2.5 Layout functions** — Load: ARCHITECTURE §7. Test: invariants. Commit: `feat(lib): rhythm and track layouts`

**P2.6 Repositories** — Load: ARCHITECTURE §3, §12. Do: `db/albums.ts photos.ts audit.ts` — public
queries (home featured + fallback, archive page, category, album by slug, prev/next, counts),
admin queries, atomic feature, reorder batch, soft delete/restore, cover reassignment.
Test: integration incl. featured race (13 parallel → 12). Commit: `feat(db): album and photo repositories`

**P2.7 Seed** — Load: ARCHITECTURE §14. Do: `scripts/seed.mjs` (local only). Test: `npm run db:seed`
twice is idempotent (wipes and reseeds). Commit: `chore: local seed data` → **GATE P2**

---

### P3 — Public routes from D1

**P3.1 Picture + dev media** — Load: ARCHITECTURE §9; DESIGN §7 (image appear). Do: `Picture.astro`
(srcset, sizes prop, LQIP background, width/height attrs, eager/lazy prop, `decoding=async`),
`pages/_dev/media/[...key].ts`. Test: SEC-DEV-01 (prod build → 404). Commit: `feat(media): picture component and dev media route`

**P3.2 Home from D1** — Load: SPEC §3 Home; DESIGN §5.1. Test: AC-HOME-01..05 with seed.
Commit: `feat(home): featured gallery and hero from database`

**P3.3 Archive** — Load: SPEC §3 Archive; DESIGN §5.2, §9. Do: `radovi/index.astro`, `ChipBar`,
`YearDivider`, `AlbumCard` (hover 2nd photo), `scripts/public/archive.ts` (+ `pageswap` naming per PD-09)
(load more, search, live region). Test: AC-ARC-01..06. Commit: `feat(archive): albums index with filters and pagination`

**P3.4 Category + routing** — Load: SPEC Category + AC-ALB-05. Do: `radovi/[seg].astro` dispatch:
category slug → category view; else album by slug; else 404. Test: AC-CAT-01/02, SEC-ENUM-01.
Commit: `feat(archive): category pages and slug routing`

**P3.5 Album page** — Load: SPEC Album; DESIGN §5.3, PD-09; ARCHITECTURE §7.1. Do: `RhythmGrid`,
album hero, breadcrumb, footer nav, CTA; lightbox across album; `@view-transition` CSS.
Test: AC-ALB-01..06. Commit: `feat(album): album page with rhythm layout`

**P3.6 SEO** — Load: SPEC §5; SECURITY §5 (JSON-LD escape). Do: `seo/jsonld.ts meta.ts`,
`sitemap.xml.ts`, `robots.txt.ts`, `/privatnost` placeholder page. Test: AC-SEO-01..05,
SEC-XSS-01 (JSON-LD part). Commit: `feat(seo): structured data, sitemap and robots`

**P3.7 Edge cache** — Load: ARCHITECTURE §10. Test: unit on header/bypass decisions.
Commit: `feat(http): edge cache for public pages` → **GATE P3**

---

### P4 — Security core

**P4.1 Access verification** — Load: SECURITY §2, §3. Do: `auth/access.ts` + `jose`.
Test: SEC-AUTH-02, SEC-AUTH-03 (all six), SEC-AUTH-04, SEC-DEV-01. Commit: `feat(auth): verify cloudflare access jwt`

**P4.2 Middleware** — Load: ARCHITECTURE §5; SECURITY §4. Do: `middleware.ts`, `lib/api/gate.ts`,
`http/headers.ts origin.ts errors.ts`, admin 403 page. Test: SEC-AUTH-01/05, SEC-CSRF-01,
SEC-HDR-01, SEC-ERR-01. Commit: `feat(http): admin gate, origin check, security headers`

**P4.3 CSP** — Load: SECURITY §4. Do: Astro 6 CSP config (verify API in node_modules types);
move any unhashable inline script to files. Test: e2e fails on any CSP violation across public
routes. Commit: `feat(http): content security policy` → **GATE P4**

---

### P5 — Admin API (handlers in `src/lib/api/`, thin page wrappers)

**P5.1 Albums read/create** — Load: ARCHITECTURE §6. Test: happy + auth matrix rows.
Commit: `feat(api): list, create and get albums`
**P5.2 Album update/delete/restore** — Load: SPEC AC-ALBED-01..03, 08, AC-DEL-02. Test: publish
rules (409 codes), slug on first publish + frozen, reserved words, restore.
Commit: `feat(api): update, publish, delete and restore albums`
**P5.3 Upload** — Load: ARCHITECTURE §8.2–8.4, §9; SECURITY §6 (SEC-UP-*), §7. Test: SEC-UP-01..10,
AC-UP-06, SEC-RATE-01, R2 cleanup when D1 insert fails. Commit: `feat(api): validated photo upload to r2`
**P5.4 Photo update/delete/restore** — Load: SPEC AC-DEL-01..03, AC-FEAT-02; ARCHITECTURE §12.
Commit: `feat(api): photo alt, featured, delete and restore`
**P5.5 Ordering** — Load: ARCHITECTURE §6, §12. Test: SEC-IDOR-01, set mismatch 400.
Commit: `feat(api): album and featured ordering`
**P5.6 Audit + purge worker** — Load: ARCHITECTURE §11. Test: purge integration.
Commit: `feat(ops): audit log and purge worker` → **GATE P5**

---

### P6 — Admin UI (Preact islands, admin only)

**P6.1 Shell** — Load: DESIGN §6 (top bar, components), §8, §9 admin; SPEC AC-ADM-03/04.
Do: `layouts/Admin.astro`, `admin.css`, `Toast`, `Dialog`, `api.ts` (typed errors → Croatian copy).
Test: axe on shell; logout link. Commit: `feat(admin): shell, toast, dialog and api client`
**P6.2 Albumi screen** — Load: SPEC AC-ALBL-01..04; DESIGN §6 Screen 1. Commit: `feat(admin): albums screen`
**P6.3 Album editor** — Load: SPEC AC-ALBED-01..04, 08; DESIGN §6 Screen 2. Do: fields, autosave
(debounce 800 ms, abort previous), status switch with reasons, delete dialog.
Test: autosave states incl. failure. Commit: `feat(admin): album editor with autosave and publishing`
**P6.4 Image pipeline** — Load: ARCHITECTURE §8.1. Do: `image/pipeline.ts worker.ts webp-fallback.ts`.
Test: e2e AC-UP-03 privacy test (GPS JPEG), fake HEIC path. Commit: `feat(admin): in-browser resize, webp encode and metadata strip`
**P6.5 Uploader** — Load: SPEC AC-UP-01..05, 07; DESIGN §6 (drop zone, overlay, tiles), §9.
Do: queue (process 1, upload 3, XHR progress, retry), overlay, beforeunload.
Commit: `feat(admin): upload queue with progress and retry`
**P6.6 Photo grid** — Load: SPEC AC-ALBED-05..07, AC-DEL-01/03; DESIGN §6 ⋯ menu.
Do: sortablejs drag + keyboard move buttons, menu, alt dialog, undo toast.
Commit: `feat(admin): photo grid with reorder, cover, featured and undo delete`
**P6.7 Naslovnica** — Load: SPEC AC-FEAT-01..04; DESIGN §6 Screen 3.
Commit: `feat(admin): homepage selection screen` → **GATE P6**

---

### P7 — Hardening and handover

**P7.1** a11y sweep all routes × 3 projects; fix everything serious/critical. Commit: `fix(a11y): …`
**P7.2** complete SEC matrix table-driven over all routes; `npm audit`. Commit: `test(security): full admin route matrix`
**P7.3** budgets + optional `npm run perf` script (lighthouse via npx on `astro preview`).
Commit: `perf: budgets and lighthouse script`
**P7.4** copy audit: every string in DESIGN §9 appears verbatim in `src/`; no English UI strings in
rendered admin/public HTML (e2e text scan for a small deny-list: "Save", "Delete", "Upload", "Loading", "Error").
Commit: `test(copy): croatian copy audit`
**P7.5** `README.md` (run, test, where docs are, deploy → docs/SETUP.md), `scripts/backup.md`,
PROGRESS final summary. → **GATE P7**. If `gh auth status` succeeds, open a **draft** PR
`build/atelier-cms → main` titled "Atelier site + gallery CMS"; otherwise skip and note it.
