# TESTING

Sections: 1 Layers · 2 Local PHP · 3 Commands · 4 Fixtures · 5 E2E sign-in and data · 6 Coverage ·
7 Budgets · 8 CI · 9 Rules

## 1. Layers

| Layer | Runs | Where |
|---|---|---|
| unit | pure TS (layout, text, media, release gate, tokens) | `tests/unit`, vitest project `unit` |
| php | the real admin API (`api/`) on PHP's built-in server behind `scripts/dev-router.php`, one server per file, temp data | `tests/php`, vitest project `php` |
| e2e | the **built** site (`dist/`) + the PHP API exactly as on the hosting (`scripts/serve.mjs`), Chromium in 3 projects (desktop, mobile 360 px, reduced motion) | `tests/e2e` |

The PHP tests and e2e read the headers from the shipped `.htaccess` files (the router parses them), so
header tests check what goes live. The router emulates the rewrite rules; Apache itself is not run locally —
Daniel checks SETUP §8 on the hosting.

## 2. Local PHP (Windows)

`scripts/php.mjs` uses `$PHP_BIN`, else `.tools/php/php.exe` with `.tools/php/php.ini`, else `php` on PATH.
`.tools/` is git-ignored. To recreate it: download the official *VS17 x64 Non Thread Safe* zip of PHP 8.4 from
downloads.php.net/~windows/releases (check the SHA-256 against `sha256sum.txt` there), unzip into `.tools/php/`,
and write `.tools/php/php.ini` with `extension_dir = "ext"` and `extension=` gd, mbstring, curl, zip, fileinfo,
openssl, exif, intl. Code must stay PHP 8.1-compatible.

## 3. Commands

```
npm run test -- --project unit                    # fast
npm run build && npm run test -- --project php    # API tests need dist/ (router, .htaccess)
npx vitest run tests/php/upload.test.ts --reporter=dot
npx playwright test tests/e2e/admin.spec.ts --project desktop --reporter=line
npm run gate                                      # check + build + test + test:e2e
```
`test:e2e` builds and starts `serve.mjs` on :4329 with `IK_TEST=1` (reused locally if already running).

## 4. Fixtures (`scripts/make-fixtures.mjs` → `tests/fixtures/`, committed)

| File | Purpose |
|---|---|
| `vp8-2400x1600.webp` (+ 1280, 640) | valid lossy triple (landscape) |
| `vp8l-1600x2400.webp` (+ 853×1280, 427×640) | valid lossless triple (portrait) |
| `vp8x-2400x2400.webp` (+ 1280, 640) | valid extended (alpha), no metadata flags |
| `vp8x-exif.webp`, `vp8x-xmp.webp`, `animated.webp` | flags → 415 |
| `jpeg-as-webp.webp`, `image.svg`, `polyglot.png`, `appended.webp` | wrong / smuggled bytes → 415 |
| `riff-lie.webp`, `truncated.webp`, `empty.bin` | broken container → 415 |
| `too-big-2401.webp` | 2401 px → 422 |
| `lqip.txt` | a valid 16 px WebP data URI |
| `camera-gps-3000x2000.jpg` | real JPEG with EXIF GPS + Orientation=6 (privacy e2e) |
| `upload-landscape.jpg`, `upload-portrait.png`, `fake.heic` | e2e uploads and the decode-error path |

## 5. E2E sign-in and data

`tests/e2e/admin-fixture.ts`: `seed(page, {empty?, user?})` sets cookie `ik-test-ns=<uuid>` and calls
`POST /api/admin/__test/seed` (exists only with `IK_LOKALNO=1` + `IK_TEST=1`): a fresh namespace with the demo
content of `src/lib/data/mock.ts` and a signed-in admin `test` (password and TOTP secret in the fixture). Seeded
photos are served from the placeholder images by the router (tests only). Every test is isolated, so the suite
runs fully parallel against one server. Failure cases use `page.route()`; never hooks in app code.

## 6. Coverage required per area

**PHP API** (`tests/php`) — everything in SECURITY.md §6, plus publish rules, slug generation/freeze and reserved
words, cover reassignment, featured cap and renumbering, reorder set-mismatch, restore positions, purge (rows +
slug retirement), the export contract (TS `parseExport` accepts what PHP writes), publishing against a fake GitHub
(only the export committed, dispatch, done when the deployed package names the content, failed / never-pulled builds).

**Public e2e** — AC-HOME-01..06 (incl. JS disabled), AC-ARC-01..06 (path pagination `/radovi/stranica/N` with and
without JS, search live region), AC-CAT-01/02, AC-ALB-01..06, AC-LB-01/02, AC-SEO-01..05.

**Admin e2e** — the screens (AC-ALBL, AC-ALBED, AC-UP, AC-DEL, AC-FEAT) against the real API; AC-UP-03 privacy
reads the stored `2400.webp` from `/media`; sign-in flows (first setup with QR + code + recovery codes, password +
code, expiry mid-work, bad invite).

**Unit** — rhythm invariants, plural, dates, slug (č ć đ š ž, reserved, collisions), srcset, release gate.

**A11y** — axe on every public route type, the three admin screens signed in, and the sign-in / first-setup
screens, across all 3 projects. Tags `wcag2a wcag2aa wcag21aa wcag22aa`; fail on serious|critical.

## 7. Budgets

Public pages: ≤ 30 KB gz JS, ≤ 25 KB CSS, hero ≤ 400 KB, no third-party requests. Checked by hand for now
(PROGRESS); an automated budgets spec runs against `serve.mjs` once added.

## 8. CI — `.github/workflows/objava.yml` job `provjere`

On push to `main` and on PRs: Node 24, the runner's PHP (8.3) → `npm ci` → `npx playwright install --with-deps
chromium` → `npm run gate` → `npm audit --omit=dev --audit-level=high`; Playwright report uploaded on failure.
The `objava` job (publish) runs only with `OBJAVA_UKLJUCENA = da`.

## 9. Rules

- Test titles start with the AC/SEC ID when there is one. One behaviour per test.
- No `test.only`, no `.skip` without a linked blocker line in PROGRESS.md.
- No sleeps — wait for UI state or `waitForResponse` (e.g. before a reload after a change).
- Selectors: roles and labels (`getByRole`, `getByLabel`) — this doubles as an a11y check.
- Tests never touch the network except localhost (the fake GitHub in `publish.test.ts` is local too).
