# PROGRESS

Read first every session. Update last every task. Keep under ~120 lines — summaries only.

## Status
Current phase: **H — Hostinger track: H1–H6 done; next H7 (budgets, copy audit, lint), H8 is Daniel's**
Branch: `build/atelier-cms` (not pushed since the Hostinger switch — push after Daniel's go)
Hosting decision (Daniel, 2026-11-10): Hostinger Unlimited on Sara Tepša's account, CamelliaSinensis model:
static Astro site + PHP admin API (`api/`) + publishing via GitHub Actions. Cloudflare backend phases are superseded.

## Done before the switch (front-end, still valid)
- P0.1/P0.2 scaffold (Cloudflare parts removed in H1); P0.3 partly: TS strict, vitest, playwright, gate.
- FE1 design system, layout, Nav/Footer, 404, site.ts with TODO(client) + release gate.
- FE2 home: hero, statement, services, area, FAQ, loader, JSON-LD, pinned track, lightbox, cursor.
- FE3 archive/category/album, rhythm, search, "Učitaj još", JSON-LD, sitemap, robots, /privatnost.
- FE4 admin screens (Albumi, editor with autosave, real in-browser image pipeline, upload queue, photo grid,
  Naslovnica).
- Content: 16 real photos from Ivana's Instagram in the placeholder slots (scripts/import-photos.mjs).

## H — Hostinger track
- [x] H1 static build (format file + .htaccess clean URLs), content from export (source.ts, validated),
      path pagination /radovi/stranica/N, Cloudflare adapter/wrangler/pool-workers removed
- [x] H2 api/ PHP: sign-in core ported from CamelliaSinensis (Argon2id, TOTP, recovery codes, invites, sessions,
      limits, first-setup code), JSON store + history + audit, content contract, uploads (RIFF chunk walk, never
      decoded), export, publish (GitHub branch sadrzaj + dispatch), install (stale pages removed, media kept)
- [x] H3 admin: api.ts fetch/XHR + CSRF, AuthGate, AccountBar (publish status, password, users, settings),
      client-only screens, mock removed; Astro CSP meta with hashes (42/42 pages covered)
- [x] H4 e2e on dist/ + PHP (serve.mjs + dev-router.php), per-test namespaces, sign-in flows, axe on sign-in
- [x] H5 objava.yml (gate → build → paket → commit to branch hosting for hPanel Deploy from Git); photos moved
      outside public_html (ikdirected-podaci/media, served by media/index.php); PHP installer + postavi.yml removed
- [x] H6 docs: CLAUDE.md, ARCHITECTURE, SECURITY, TESTING, SETUP (hr, Hostinger + Porkbun), VODIC (hr)
      Gate green: check 0 errors, 122 vitest (40 unit + 82 PHP API), 246 e2e (3 projects).
- [x] 2026-11-12 merged into main (PR #1); CI gate green on Linux (PHP 8.3); non-breaking audit fixes (vite 7.3.8, zod 4.6.7)
- [x] 2026-11-12 contact form beside "Pišite mi" (footer, all public pages): front-end validation, mailto: until the
      mail endpoint (Daniel: mail later, together). Gate green: 138 vitest, 258 e2e.
- [ ] H7 Astro 7 upgrade; budgets spec on serve.mjs; copy audit; eslint/prettier + noUncheckedIndexedAccess
- [ ] Contact mail endpoint (api/, with Daniel): POST from the form, rate limit + honeypot, SEC tests

## Installed versions
astro 6.4.8 · @astrojs/preact 5.1.5 · preact 10.29.8 · @preact/signals 2.11.2 · sortablejs 1.15.7 ·
@jsquash/webp 1.5.0 · typescript 6.0.3 · @astrojs/check 0.9.10 · vitest 4.1.11 · @playwright/test 1.63.0 ·
@axe-core/playwright 4.13.0 · @types/node 22.20.4 · sharp 0.35.5 · node 24.13.0 / npm 11.6.2 ·
local PHP 8.4.27 (portable, .tools/, sha256 checked) · CI PHP = ubuntu-24.04 runner's 8.3
Removed (H1): @astrojs/cloudflare, wrangler, @cloudflare/vitest-pool-workers.

## Decisions
- 2026-09-27 Pinned the last Astro-6-compatible lines (npm latest is Astro 7). TS 6.x, vitest 4.1.x.
- 2026-09-30 Daniel: match reference exactly → nav is brand + "Provjerite termin" only. Footer end row
  "Svi radovi · Privatnost". Track end card "Sve priče (N) →". Album CTA → #kontakt.
- 2026-09-30 Archivo optimizedFallbacks off (→ ✕ from system-ui). --t-body token over reference 14px.
- 2026-09-30 a11y conflict PD-10 (.28 words fail contrast at rest): axe after a read-through; reduced motion shows
  full text. Accessibility wins if Daniel disagrees.
- 2026-09-30 No-JS link test runs with reducedMotion (Playwright click stalls mid view-transition).
- 2026-10-01 Photo responses carry `thumb`. Copy not in DESIGN §9 kept minimal (alt "Spremi", aria names).
- 2026-10-01 make-fixtures: placeholders rebuilt only with --force; real photos kept unless --overwrite-photos.
- 2026-11-10 Daniel: Hostinger (Sara's Unlimited plan, cousins agree) instead of Cloudflare/Netlify.
- 2026-11-10 Photos are NOT pushed to GitHub (CamelliaSinensis pushes its images): only the public export
  (metadata); photos live in public_html/media. Keeps the repo small and drafts off GitHub.
- 2026-11-11 Daniel: deploy through hPanel "Deploy from Git" (branch hosting). hPanel runs no build and may replace
  all of public_html → GitHub builds; photos live in ikdirected-podaci/media (one PHP request per image, cached a year);
  publish is done when public_html/.ik-paket.json names the content commit. (CamelliaSinensis used artifact install.)
- 2026-11-10 Server never decodes uploads (no GD on untrusted bytes, libwebp CVE class); container parse only.
- 2026-11-10 Publish batches edits: 20 s quiet or "Objavi sada"; never during a running build.
- 2026-11-10 Pagination moved from ?stranica=N to /radovi/stranica/N (static files); a query string on a
  static page is served (canonical names the address) instead of 404.
- 2026-11-10 Without branch sadrzaj the production build uses an empty export, never the demo albums.
- 2026-11-10 Sign-in copy written in neutral ti-form (not in DESIGN §9 yet): Prijava, Kod s mobitela,
  Postavljanje administracije, Dvostruka potvrda, Spremi rezervne kodove, Pozivnica…; top bar status
  "Stranica je ažurna / Čeka objavu / Objavljujem… / Objava nije uspjela / Objava nije postavljena".
- 2026-11-10 E2E isolation: cookie ik-test-ns → own data/media folders (IK_LOKALNO=1 + IK_TEST=1 only).

- 2026-11-12 Contact form errors use --danger on public pages (clarity over the admin-only token note).
  Form hidden without JS (no endpoint to submit to yet; mailto/phone links stay).
- 2026-11-12 Hostinger reality: site ikdirected.com was created as a Node.js/Astro build of `main` (no api/, demo
  content). Its auto-deploy was removed (files kept); API refuses a static deploy on a Node.js site and classic Git
  needs an empty public_html → Daniel renames public_html, then classic Git of branch `hosting` + hPanel webhook.
  DNS stays at Porkbun: A @ 82.198.229.93, CNAME www → ikdirected.com; SSL active (lifetime, HTTPS redirect on).

## Blockers
- 2026-11-12 npm audit: Astro 6 advisories (incl. AVIF "critical") fixed only in Astro 7; not applicable to static
  output with passthrough images. CI audit step is non-blocking until the Astro 7 upgrade (H7).

## Waiting on Daniel / client
- Hosting live 2026-11-12 (SETUP §2–3 rewritten): classic hPanel Git of `hosting` + webhook verified end to end
  (PR #3 → Objava → hosting 54fb51c → live), SSL covers www, PHP API answers firstSetup. Left for Daniel: first
  account (SETUP §4), token (§5), invite Ivana (§6); optional cron osvjezi; old public_html.stari can be deleted.
- Email, phone, prices, FAQ answers, review → `src/content/site.ts`
- Category intros in site.ts drafted from reference facts only — client must approve (TODO(client))
- Approve the sign-in copy (then move it into DESIGN §9)
- ph-03 (Iz zraka card fallback) is not a drone photo — swap in a real aerial shot when available
- Instagram page title names the photographer "Ivana Klarica" — confirm before putting it in site.ts
- Apache/LiteSpeed rules are emulated locally, not run: check SETUP §8 on the hosting once

## Next session starts at
H7 — budgets spec (tests/e2e/budgets.spec.ts); or the contact mail endpoint when Daniel is ready.
After Daniel's first account + token: check an admin publish reaches the site (status "Stranica je ažurna").
