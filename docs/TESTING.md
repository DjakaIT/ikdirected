# TESTING

Sections: 1 Layers · 2 Config · 3 Commands · 4 Fixtures · 5 E2E auth · 6 What each area must
cover · 7 Budgets · 8 CI · 9 Rules

---

## 1. Layers

| Layer | Tool | Runs in | Tests |
|---|---|---|---|
| Unit | Vitest project `unit` | Node | pure functions: webp parser, rhythm/track layout, slug, plural, dates, zod schemas, JSON-LD escape, header builder, release gate |
| Integration | Vitest project `workers` + `@cloudflare/vitest-pool-workers` | workerd with local D1 + R2 | repositories, API handlers (ARCHITECTURE §6 handler pattern), admin gate, purge worker, SEC-* matrix |
| E2E | Playwright + `@axe-core/playwright` | Chromium against `astro dev` (workerd, local bindings, seeded) | user journeys, a11y, keyboard, reduced motion, CSP violations, JS budget, upload privacy |

No mocks of D1/R2 — use the real local bindings. Mock only the Access JWKS fetch.

---

## 2. Config sketches

`vitest.config.ts` — two projects: `unit` (`tests/unit/**/*.test.ts`, environment node) and
`workers` (`tests/integration/**/*.test.ts`, pool `@cloudflare/vitest-pool-workers`, pointing at
`wrangler.jsonc`, `miniflare.bindings` for vars). Integration `setup.ts`:
`await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)` (read migrations in the config with
`readD1Migrations("./migrations")`), and a per-test reset that deletes all rows and lists+deletes
all R2 objects. Confirm helper names against the installed `@cloudflare/vitest-pool-workers`
README before using them.

`playwright.config.ts`:
- `webServer: { command: "npm run db:migrate && npm run db:seed && npm run dev -- --port 4321", url: "http://localhost:4321", reuseExistingServer: !process.env.CI, timeout: 120_000 }`
- projects: `desktop` (1440×900), `mobile` (360×780, `hasTouch`, `isMobile`), `reduced` (desktop + `reducedMotion: "reduce"`).
- `use: { trace: "retain-on-failure" }`, `retries: process.env.CI ? 1 : 0`.

---

## 3. Commands

```
npm run test                                   # both vitest projects
npx vitest run --project unit tests/unit/webp.test.ts --reporter=dot
npx vitest run --project workers tests/integration/api-upload.test.ts --reporter=dot
npm run test:e2e                               # all projects
npx playwright test tests/e2e/admin-upload.spec.ts --project=desktop --reporter=line
RELEASE=1 npm run test -- --project unit       # release gate (fails while TODO(client) remain)
npm run gate                                   # check + test + test:e2e
```

---

## 4. Fixtures (`scripts/make-fixtures.mjs` → `tests/fixtures/`, committed)

| File | Purpose |
|---|---|
| `vp8-2400x1600.webp`, `vp8-1280x853.webp`, `vp8-640x427.webp` | valid lossy triple (landscape) |
| `vp8l-1600x2400.webp` (+ 1280, 640) | valid lossless triple (portrait) |
| `vp8x-2400x2400.webp` (+ 1280, 640) | valid extended, no metadata flags |
| `vp8x-exif.webp` | EXIF flag set → 415 |
| `vp8x-xmp.webp` | XMP flag set → 415 |
| `animated.webp` | animation flag → 415 |
| `jpeg-as-webp.webp` | JPEG bytes → 415 |
| `image.svg` | SVG with `<script>` → 415 |
| `polyglot.png` | PNG + appended `<?php … ?>` → 415 |
| `riff-lie.webp` | RIFF size ≠ length → 415 |
| `too-big-2401.webp` | 2401 px → 422 |
| `truncated.webp`, `empty.bin` | 415 |
| `camera-gps-3000x2000.jpg` | **real JPEG with EXIF GPS + Orientation=6** for the e2e privacy test |
| `fake.heic` | random bytes named .heic → client decode error path |
| `placeholder/*.webp` | 8 gradient images of mixed aspect ratios for P1 static home |

LQIP fixture: a valid 16 px WebP data URI string in `tests/fixtures/lqip.txt`.

---

## 5. E2E auth

Admin specs use a Playwright fixture that sets cookie `dev_auth=1` for `localhost` before the
page loads. `.dev.vars` (copied from `.dev.vars.example` by `npm run test:e2e` if missing) has
`DEV_AUTH_BYPASS=1`. A separate spec `admin-denied.spec.ts` runs **without** the cookie and must
get 403 on `/admin` and 401 on `/api/admin/albums` (proves the bypass is not ambient).
Real Cloudflare Access is never called from tests.

---

## 6. Coverage required per area

**Public e2e** (`tests/e2e/public-*.spec.ts`)
- AC-HOME-01..06 (incl. JS disabled context for AC-HOME-06), AC-ARC-01..06 (pagination with
  and without JS, search live region), AC-CAT-01/02, AC-ALB-01..06, AC-LB-01/02 (keyboard,
  focus return, `inert`), AC-SEO-01..05 (parse JSON-LD with `JSON.parse`, check sitemap XML).
- View transitions: no console errors; reduced project has `@view-transition` disabled.
- CSP: fail the test on any `securitypolicyviolation` event (listen via `page.on("console")` and
  an injected listener).

**Admin e2e** (`tests/e2e/admin-*.spec.ts`)
- Create album → edit fields → autosave indicator → upload 3 fixtures → reorder by keyboard →
  set cover → feature 2 → publish → visit public page → photo order + cover correct.
- **AC-UP-03 privacy:** upload `camera-gps-3000x2000.jpg`; fetch the stored `2400.webp` via
  `/_dev/media`; assert RIFF/WEBP, no EXIF/XMP chunk or flag, long edge 2400, orientation applied
  (width < height because Orientation=6).
- Upload `fake.heic` → decode error copy shown; other files in the batch still succeed.
- Delete photo → undo within 10 s → back in same position. Delete album → appears in
  "Nedavno obrisano" → Vrati.
- Naslovnica: feature 12, 13th blocked with copy; reorder; homepage reflects order.
- Failed autosave (route `page.route` to 500) → error line + retry, value preserved.
- `beforeunload` registered while uploading (assert via `page.on("dialog")`).

**Integration** — everything in SECURITY.md §6, plus: publish rules, slug generation/freeze and
reserved words, cover reassignment on delete, featured cap atomicity (run 13 PATCHes in
parallel → exactly 12 featured), reorder set-mismatch, restore positions, purge worker (rows +
R2 keys gone after 7 days, younger untouched), audit rows written.

**Unit** — webp parser (every fixture), rhythm invariants (order, count, determinism, all kinds),
plural (0,1,2,4,5,11,12,14,21,22,25,101,111), dates (hr months), slug (č ć đ š ž, spaces,
punctuation, reserved, collisions `-2`), schemas (unknown keys, control chars), JSON-LD escape.

**A11y** — `tests/e2e/a11y.spec.ts`: axe on `/`, `/radovi`, `/radovi/vjencanja`, a seeded album,
`/404-test`, `/admin`, `/admin/albumi/{seeded}`, `/admin/naslovnica`, across all 3 projects.
Tags `wcag2a wcag2aa wcag21aa wcag22aa`; fail on impact serious|critical. Plus a keyboard-only
walk of the home page (Tab order reaches nav, gallery, cards, footer; no traps).

---

## 7. Budgets (blocking)

`tests/e2e/budgets.spec.ts`: sum `transferSize` of `script` resources per public page ≤ 30 KB;
CSS ≤ 25 KB; hero image request ≤ 400 KB; no requests to third-party origins on public pages.
Lighthouse (AC-PERF-02) is `npm run perf` — informative, not in the gate.

---

## 8. CI — `.github/workflows/ci.yml`

On push to `build/**` and on PRs: Node 22 → `npm ci` → `npx playwright install --with-deps
chromium` → `cp .dev.vars.example .dev.vars` → `npm run gate` → `npm audit --omit=dev
--audit-level=high`. Upload Playwright report on failure. No deploy step.

---

## 9. Rules

- Test titles start with the AC/SEC ID. One behaviour per test.
- No `test.only`, no `.skip` without a linked blocker line in PROGRESS.md.
- No sleeps — wait for UI state (`expect(...).toHaveText`, `waitForResponse`).
- Selectors: roles and labels (`getByRole`, `getByLabel`) — this doubles as an a11y check.
- Tests never touch the network except localhost (fail on other hosts in e2e route handler).
