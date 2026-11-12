# SECURITY

If anything elsewhere conflicts with this file, this file wins.

Sections: 1 Threat model · 2 Sign-in · 3 Sessions and CSRF · 4 Headers · 5 Input/output rules ·
6 Required tests · 7 Upload controls · 8 Dependencies & config · 9 Privacy · 10 Operations

Hosting since 2026-11-10: Hostinger (static site + PHP admin API, ARCHITECTURE §1). The sign-in core is the one
from CamelliaSinensis/Septillion, ported and tested here against the real PHP.

---

## 1. Threat model

Assets: the photographer's published reputation (site integrity), unpublished albums, client photos (privacy —
faces, locations), her admin session, the GitHub token (write access to the content branch), the hosting account.

| # | Threat | Mitigation | Test |
|---|---|---|---|
| T1 | Anyone reaches the admin API | Every route except sign-in and `/osvjezi` needs a full session (password **and** TOTP); the static admin shell holds no data | SEC-AUTH-01, SEC-AUTH-05 |
| T2 | Password guessing / credential stuffing | Argon2id; 5 failures / user / 15 min, 20 / IP, 200 overall → 429 without checking; same answer for unknown user and wrong password; dummy hash so timing matches | auth tests |
| T3 | Stolen password | TOTP (RFC 6238, a step is never accepted twice); single-use recovery codes stored as SHA-256 | auth tests |
| T4 | Session theft / fixation | 256-bit random id in an HttpOnly SameSite=Strict `__Host-` Secure cookie; server stores only its SHA-256; new id on every sign-in step; 30 min idle, 12 h max; password change/reset/removal bumps `sessionVersion` (signs out everywhere) | auth tests |
| T5 | Logged-in browser tricked into a mutation (CSRF) | Origin == site and Sec-Fetch-Site same-origin on every mutating request, **and** the session's `X-CSRF` token; SameSite=Strict cookie | SEC-CSRF-01/02 |
| T6 | First setup hijacked on a fresh install | Setup needs the code in `PRVO-POSTAVLJANJE.txt` outside `public_html` (only the hosting owner can read it); one-time | — (manual, SETUP §5) |
| T7 | Malicious file upload (web shell, stored XSS via SVG, polyglot) | Client re-encodes to WebP; server accepts **only** structurally valid still WebP (chunk walk, size field must match length); no SVG ever; server-generated UUID paths; files stored **outside** `public_html` (nothing uploaded can ever be executed by the web server) and sent only by `media/index.php` for `p/<uuid>/<variant>.webp` as `image/webp` with `nosniff` + `sandbox` CSP; never decoded or executed server-side | SEC-UP-01..10 |
| T8 | Draft / deleted content leak | Only the public export (published, live) leaves the hosting and is built; unknown, draft and deleted slugs are the same static 404; the next build commit removes pages of deleted albums (rsync --delete on branch hosting) | SEC-ENUM-01, publish tests |
| T9 | Stored XSS through titles, places, alt, story | Astro auto-escaping, no `set:html` with data, JSON-LD `<` → `<`, CSP without `unsafe-inline` scripts (hashes) | SEC-XSS-01 |
| T10 | IDOR / mass assignment | Strict key sets; ids checked as UUID; reorder needs exactly the live set of that album | SEC-IDOR-01 |
| T11 | Location leak from photo EXIF/GPS | Canvas re-encode strips metadata; server rejects VP8X with EXIF/XMP flags or chunks | SEC-UP-06, AC-UP-03 |
| T12 | Path traversal / file overwrite | No path from user input (UUIDs we generated, checked); nothing is unpacked on the hosting — `public_html` is hPanel's Git checkout of branch hosting | content/upload tests |
| T13 | Malicious or broken build on the hosting | Branch `hosting` is written only by `objava.yml` on `main` (GITHUB_TOKEN with `contents: write` for that job only) after the build; hPanel deploys only that branch; `.git/` and dot files are 404; a failed build never reaches `hosting` | publish tests, SETUP §7 |
| T13b | Git deploy wipes data | Nothing that must survive is in `public_html`: accounts, content, history and photos are in `ikdirected-podaci/` | ARCH §1, §9 |
| T14 | GitHub token leak | Fine-grained, one repository, Contents RW + Actions R, expiring; stored only in the data folder (mode 600, outside `public_html`); never returned to the browser | publish tests |
| T15 | Abuse from a stolen session (storage fill) | 1500 uploads / user / 24 h; album cap 400; soft delete 7 days; audit log | SEC-RATE-01 |
| T16 | Information disclosure in errors | Uniform `{error:{code,message}}`, 500 `INTERNAL` with no detail; `display_errors` off; `X-Powered-By` removed | SEC-ERR-01 |
| T17 | Clickjacking, MIME sniffing, referrer leaks | Headers §4 from `.htaccess` on every response | SEC-HDR-01 |
| T18 | Test-only code active on the hosting | Seed route and namespaces need `IK_LOKALNO=1` **and** `IK_TEST=1` env vars, which the hosting never sets; `scripts/dev-router.php` is not in the package | — (package content, SETUP) |
| T19 | Vulnerable dependency | Exact pins, `npm audit --omit=dev --audit-level=high` in CI; PHP uses only built-in functions | CI |

---

## 2. Sign-in (`api/lib/passwords.php`, `users.php`, `app.php`)

- Passwords: Argon2id (m = 19 MiB, t = 2, p = 1), NFKC-normalised; bcrypt over SHA-256 only if Argon2 is missing.
  Rules: ≥ 12 characters, ≤ 200, ≥ 5 different characters, not containing the user name or a common password.
- TOTP: SHA-1, 6 digits, 30 s, ±1 step, last used step stored (no replay). Recovery: 8 codes, single use.
- Roles: the first account is `admin` (invites, removes, publish settings); invited accounts are `urednik`.
- Invites: 256-bit token, stored as SHA-256, 72 h, single use; reset = new password + 2FA, signs out everywhere.

## 3. Sessions and CSRF (`api/lib/sessions.php`, `App::signedIn()`)

- Cookie `__Host-ik-admin` (production: Secure, Path=/, HttpOnly, SameSite=Strict). File name = SHA-256 of the id.
- Steps `2fa` / `setup-2fa` live 5 min; `in` 30 min idle (status polls send `X-Background: 1` and do not count),
  12 h max. Five wrong codes end the step.
- Mutations: Origin + Sec-Fetch-Site check (403 `ORIGIN`) before routing, then `X-CSRF` (403 `FORBIDDEN`).
- `Host` must be the configured site (DNS rebinding) → 421.

---

## 4. Headers (`public/.htaccess`, `media/.htaccess`, `api/.htaccess` + `App::headers()`)

Site (every response): `Strict-Transport-Security: max-age=31536000` (`includeSubDomains` once every subdomain
has HTTPS), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()`,
`Cross-Origin-Opener-Policy: same-origin`, `X-Frame-Options: DENY`,
`Content-Security-Policy: frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'`.

Page CSP (`<meta>` per page from Astro `security.csp`, hashes of that page's scripts and styles):
`default-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none';
form-action 'self'; img-src 'self' data:; script-src 'self' <hashes>; style-src 'self' <hashes>`.
Never `'unsafe-inline'` in `script-src`. The inline boot script is a constant whose hash is added in
`Public.astro`. **No server-rendered `style="…"` attributes** on public pages. Setting styles from JS through the
CSSOM is allowed.

Admin pages: + `img-src … blob:`, `worker-src 'self' blob:`, `'wasm-unsafe-eval'` (WebP WASM fallback);
`X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store`.
API: `application/json; charset=utf-8`, `no-store`, `default-src 'none'` CSP, `noindex`.
Media: §7.

---

## 5. Input and output rules

- JSON bodies must be objects with known keys only. Trim strings; collapse internal whitespace in title/place;
  reject control chars except `\n`.
- Dates: `YYYY-MM-DD`, real calendar date, between 2000-01-01 and today + 2 years.
- `status: "published"` only via PATCH, only when publish rules pass (AC-ALBED-03).
- Slugs are generated server-side only (never from the client), never reserved words, never reused after purge.
- Output: Astro expressions only. JSON-LD: `JSON.stringify(obj).replace(/</g, "\\u003c")`.
- Never build HTML strings in client scripts from data — use `textContent` / DOM APIs.
- Never log request bodies, passwords, tokens, or cookies (the audit log holds actor, IP, action, target).

---

## 6. Required tests (IDs go in test titles) — `tests/php/*.test.ts` against the real PHP

For **every** content route × method, table-driven: SEC-AUTH-01 (no session → 401), SEC-CSRF-01 (foreign
Origin → 403 ORIGIN), SEC-CSRF-02 (no CSRF token → 403), plus validation failures and a happy path.

| ID | Assertion |
|---|---|
| SEC-AUTH-05 | `/admin` without a session shows sign-in and no album data (e2e) |
| SEC-UP-01 | SVG bytes → 415 |
| SEC-UP-02 | JPEG bytes in a `.webp` part → 415 |
| SEC-UP-03 | PNG with appended script, WebP with appended payload → 415 |
| SEC-UP-04 | RIFF size field lies, truncated file → 415 |
| SEC-UP-05 | animated WebP → 415 |
| SEC-UP-06 | VP8X with EXIF or XMP → 415 |
| SEC-UP-07 | variant over byte cap → 413; request over 4 MB → 413 |
| SEC-UP-08 | dimensions disagree with meta or each other → 422; > 2400 px → 422 |
| SEC-UP-09 | missing/extra multipart fields, bad meta → 400 |
| SEC-UP-10 | stored under `<data>/media/p/<uuid>/<variant>.webp` (outside public_html), served as image/webp with nosniff + sandbox; other paths 404 |
| SEC-SQL-01 | `'; DROP TABLE albums; --` and `" OR 1=1 --` stored verbatim (no database, but the rule stands) |
| SEC-XSS-01 | hostile titles/stories stored verbatim; rendering escapes them (Astro) |
| SEC-IDOR-01 | reorder with a photo id from another album → 400; restore unknown id → 404 |
| SEC-ENUM-01 | draft album slug and nonexistent slug get the same static 404 (e2e) |
| SEC-HDR-01 | API headers on an API 400; site headers on `/`, a 404, `/admin` (e2e + router reads the shipped `.htaccess`) |
| SEC-RATE-01 | 1501st upload in 24 h for one user → 429 |
| SEC-ERR-01 | forced internal error → 500 `{error:{code:INTERNAL,message:"Greška na poslužitelju."}}` only |
| auth | wrong password = unknown user; TOTP replay refused; recovery code single use; 5 failures → 429 + Retry-After; cookie HttpOnly + SameSite=Strict; password change signs out other sessions; editors cannot manage users; invite single use |
| publish | export holds only published live content; only the export file is committed; token never returned; main/hosting refused as content branch; done only when the deployed package names the content; failed build and never-pulled build reported |

---

## 7. Upload controls (summary — details ARCHITECTURE §8)

Allow-list only plain still WebP on the server · RIFF size must equal the length · every chunk walked, only
image chunks allowed · EXIF/XMP/animation rejected · byte caps per variant + request cap · dimension caps and
cross-checks · server-side UUID paths · stored outside `public_html` · sent only by `media/index.php` (variant
pattern only, `image/webp`, `nosniff`, `default-src 'none'; sandbox`) · never decoded, transformed or executed
server-side · client re-encode removes metadata. Same origin as the site (ARCHITECTURE §9).

---

## 8. Dependencies and config

- Pin exact versions (`save-exact=true`). Commit `package-lock.json`. CI runs `npm audit --omit=dev --audit-level=high`
  (reported, not blocking since 2026-11-12: the open advisories are in Astro 6 and its sharp/esbuild, fixed only in
  Astro 7, and none applies to static output with passthrough images — upgrade planned in PLAN H7).
- PHP: built-in functions only (no Composer); must run on PHP 8.1+; `index.php` refuses to run without
  mbstring, json, curl (or allow_url_fopen).
- Astro: `image: { service: passthroughImageService() }`, no remote patterns.
- Secrets: only the GitHub token, entered by Daniel in the admin and stored in the data folder. Nothing secret in
  the repository, the package or GitHub variables.
- Test-only behaviour exists only with `IK_LOKALNO=1` and `IK_TEST=1` (env vars the hosting never has).

---

## 9. Privacy

- Every published photo is re-encoded client-side; originals never leave her device.
- No analytics, no third-party scripts, no cookies on the public site (the admin cookie is set only under
  `/admin` use, path `/`, HttpOnly).
- Soft-deleted content is irrecoverable after 7 days, media files included; the audit log is bounded (~2 MB).
- GitHub gets only what is public anyway (the export of published albums); drafts and the trash stay on the hosting.
- Privacy notice page content is `TODO(client)`.

---

## 10. Operations (Daniel, docs/SETUP.md §10)

- Lost phone / suspicious activity: admin → Korisnici → Nova pozivnica (reset) or Ukloni; `dnevnik.log`.
- Token: renew before expiry; revoke on GitHub if leaked, then enter a new one.
- Backups: Hostinger daily backups; monthly download of `ikdirected-podaci/` (content, accounts and photos).
- Keep PHP on a supported version (hPanel); the API states missing extensions itself.
