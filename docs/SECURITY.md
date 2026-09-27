# SECURITY

If anything elsewhere conflicts with this file, this file wins.

Sections: 1 Threat model · 2 Access setup assumptions · 3 JWT verification · 4 Headers ·
5 Input/output rules · 6 Required tests · 7 Upload controls · 8 Dependencies & config ·
9 Privacy · 10 Operations

---

## 1. Threat model

Assets: the photographer's published reputation (site integrity), unpublished albums, client
photos (privacy — faces, locations), her admin session, Daniel's Cloudflare account.

| # | Threat | Mitigation | Test |
|---|---|---|---|
| T1 | Anyone reaches `/admin` or `/api/admin` | Cloudflare Access at edge **and** JWT verified in middleware; `workers_dev: false` so the `*.workers.dev` hostname cannot bypass Access | SEC-AUTH-01..05 |
| T2 | Forged / replayed / wrong-app token | RS256 only, JWKS from team domain, `iss` + `aud` + `exp` + `nbf` checked, 60 s leeway | SEC-AUTH-02/03 |
| T3 | Logged-in browser tricked into a mutation (CSRF) | Origin == SITE_ORIGIN and Sec-Fetch-Site same-origin on every mutating request; JSON bodies only (except upload multipart); Access cookie is SameSite | SEC-CSRF-01 |
| T4 | Malicious file upload (web shell, stored XSS via SVG, polyglot) | Client re-encodes to WebP; server accepts **only** structurally valid WebP by magic bytes + chunk parse; no SVG ever; random keys; served from separate origin with nosniff + sandbox CSP; never decoded or executed server-side | SEC-UP-01..10 |
| T5 | Stored XSS through titles, places, alt, story | Astro auto-escaping, no `set:html` with data, JSON-LD serialised with `<` → `<`, strict CSP without `unsafe-inline` scripts | SEC-XSS-01 |
| T6 | SQL injection | Only prepared statements with `.bind()`; identifiers never from input | SEC-SQL-01 |
| T7 | IDOR / mass assignment | zod `.strict()` bodies; ids validated as UUID; ownership checks (photo ∈ album) on order/restore | SEC-IDOR-01 |
| T8 | Draft/unpublished content leak | Public queries always filter `status='published' AND deleted_at IS NULL`; drafts 404 identically to unknown | SEC-ENUM-01 |
| T9 | Location leak from photo EXIF/GPS | Canvas re-encode strips metadata; server rejects VP8X with EXIF/XMP flags | SEC-UP-06 |
| T10 | Dev auth bypass shipped to prod | Bypass requires `import.meta.env.DEV` **and** `DEV_AUTH_BYPASS=1` **and** hostname localhost/127.0.0.1 **and** cookie `dev_auth=1` (set only by e2e admin fixtures) | SEC-DEV-01 |
| T11 | Abuse from a stolen session (storage fill) | 1500 uploads/actor/24 h; album cap 400; soft delete 7 days; audit log | SEC-RATE-01 |
| T12 | Information disclosure in errors | Uniform error JSON, no stack/SQL/input echo; request id only | SEC-ERR-01 |
| T13 | Clickjacking, MIME sniffing, referrer leaks | Headers §4 on every response | SEC-HDR-01 |
| T14 | Vulnerable dependency (e.g. Astro image endpoint CVEs) | `@astrojs/cloudflare` ≥ 13.1.10; image endpoint not used (passthrough service, no remote patterns); `npm audit` in CI | CI |

---

## 2. Cloudflare Access assumptions (configured by Daniel, SETUP.md)

- Self-hosted application covering **both** `ikdirected.com/admin*` and `ikdirected.com/api/admin*`.
- Policy: Allow → Emails → the photographer + Daniel. Identity: One-time PIN (email).
- Session duration 24 h. `workers_dev: false` and preview URLs disabled in `wrangler.jsonc`.
- Code must not assume the edge did its job — §3 runs on every admin request regardless.

---

## 3. JWT verification — `src/lib/auth/access.ts`

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;   // module-level cache, JWKS rotates ~6 weeks

export async function verifyAccess(req: Request, env: Env, isDev: boolean) {
  if (isDev && env.DEV_AUTH_BYPASS === "1" && isLocalHost(new URL(req.url).hostname)
      && hasCookie(req, "dev_auth", "1"))                          // all four, or no bypass
    return { email: env.DEV_AUTH_EMAIL };                        // SEC-DEV-01 guards this
  const token = req.headers.get("cf-access-jwt-assertion");      // header, not the cookie
  if (!token) throw unauthorized();
  jwks ??= createRemoteJWKSet(new URL(`${env.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
  const { payload } = await jwtVerify(token, jwks, {
    issuer: env.CF_ACCESS_TEAM_DOMAIN, audience: env.CF_ACCESS_AUD,
    algorithms: ["RS256"], clockTolerance: 60,
  });
  const email = String(payload.email ?? "").trim().toLowerCase();
  if (!email) throw unauthorized();
  if (!allowlist(env.ADMIN_EMAILS).has(email)) throw forbidden();
  return { email };
}
```
`isDev` is passed from `import.meta.env.DEV` by middleware (so tests can drive both branches).
Tests generate an RSA key pair, expose a JWKS through the pool-workers fetch mock, and sign
tokens with jose — including an `alg: none` token and an HS256 token signed with the public key.

---

## 4. Headers — `src/lib/http/headers.ts` (applied in middleware to every response)

Common:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()
Cross-Origin-Opener-Policy: same-origin
X-Frame-Options: DENY
```
Public CSP (use Astro 6's CSP support to hash inline scripts/styles; if something cannot be
hashed, move it to a file — **never** add `'unsafe-inline'` to `script-src`):
```
default-src 'self'; script-src 'self' <hashes>; style-src 'self' <hashes>;
img-src 'self' data: https://media.<domain>; font-src 'self'; connect-src 'self';
object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
```
**No server-rendered `style="…"` attributes** on public pages (they would need
`'unsafe-inline'`, and Astro's style hashes make browsers ignore `'unsafe-inline'` anyway).
Use classes, `width`/`height` attributes for aspect ratio, and an `<img>` element for LQIP.
Setting styles from JS through the CSSOM (`el.style.x = …`) is allowed — CSP does not block it.

Admin CSP = public + `img-src … blob:` + `worker-src 'self' blob:` + `'wasm-unsafe-eval'` in
`script-src` (WebP WASM fallback). Admin also: `Cache-Control: no-store`,
`X-Robots-Tag: noindex, nofollow`. API responses: `Content-Type: application/json; charset=utf-8`,
`Cache-Control: no-store`.

---

## 5. Input and output rules

- Parse every body with zod `.strict()`; reject unknown keys. Trim strings; collapse internal
  whitespace in title/place; reject control chars (`/[\u0000-\u001F\u007F]/`) except `\n` in story.
- Dates: `YYYY-MM-DD`, real calendar date, between 2000-01-01 and today + 2 years.
- `status: "published"` only via PATCH, only when publish rules pass (AC-ALBED-03).
- Slugs are generated server-side only; never accepted from the client.
- Output: Astro expressions only. JSON-LD: `JSON.stringify(obj).replace(/</g, "\\u003c")`.
- Never build HTML strings in client scripts from data — use `textContent` / DOM APIs.
- Never log request bodies, tokens, or cookies.

---

## 6. Required tests (IDs go in test titles)

For **every** `/api/admin` route × method, table-driven: SEC-AUTH-01 (no token → 401),
SEC-AUTH-04 (not allow-listed → 403), SEC-CSRF-01 (foreign Origin on mutating → 403),
plus one validation-failure test and one happy path.

| ID | Assertion |
|---|---|
| SEC-AUTH-02 | token signed by an unknown key → 401 |
| SEC-AUTH-03 | wrong aud, wrong iss, expired, nbf in future, `alg:none`, HS256-with-public-key → 401 each |
| SEC-AUTH-05 | `GET /admin` without token → 403 HTML page that contains no album data |
| SEC-DEV-01 | bypass ignored when `isDev=false`; ignored for hostname ≠ localhost; ignored without the `dev_auth` cookie; `/_dev/media/*` returns 404 in a production build |
| SEC-UP-01 | SVG bytes → 415 |
| SEC-UP-02 | JPEG bytes in a `.webp` part → 415 |
| SEC-UP-03 | PNG with appended script payload → 415 |
| SEC-UP-04 | RIFF size field lies → 415 |
| SEC-UP-05 | animated WebP → 415 |
| SEC-UP-06 | VP8X with EXIF or XMP flag → 415 |
| SEC-UP-07 | variant over byte cap → 413; Content-Length over 4 MB → 413 |
| SEC-UP-08 | dimensions disagree with meta or each other → 422; > 2400 px → 422 |
| SEC-UP-09 | missing/extra multipart fields → 400 |
| SEC-UP-10 | stored R2 key matches `^p/[0-9a-f-]{36}/(2400|1280|640)\.webp$` and metadata contentType is image/webp |
| SEC-SQL-01 | `'; DROP TABLE albums; --` and `" OR 1=1 --` in title/place/story are stored verbatim and tables remain |
| SEC-XSS-01 | `<script>alert(1)</script>`, `"><img src=x onerror=alert(1)>`, `</script><script>` in title/alt/story render escaped on public page, admin page and inside JSON-LD |
| SEC-IDOR-01 | reorder with a photo id from another album → 400; restore unknown id → 404 |
| SEC-ENUM-01 | draft album slug and nonexistent slug return byte-identical 404 bodies |
| SEC-HDR-01 | §4 headers present on `/`, a 404, `/admin`, and an API 400 |
| SEC-RATE-01 | 1501st upload in 24 h for one actor → 429 |
| SEC-ERR-01 | forced internal error → 500 JSON with code INTERNAL, no stack/SQL text |

---

## 7. Upload controls (summary — details ARCHITECTURE.md §8)

Allow-list only WebP on the server · magic bytes + chunk structure parsed · EXIF/XMP/animation
rejected · byte caps per variant + request cap · dimension caps and cross-checks · random
server-side keys · object storage on a separate origin · nosniff + sandbox CSP on that origin ·
never decoded, transformed, or executed server-side · client re-encode removes metadata.

---

## 8. Dependencies and config

- Pin exact versions (`save-exact=true` in `.npmrc`). Commit `package-lock.json`.
- CI: `npm audit --omit=dev --audit-level=high` must pass.
- `@astrojs/cloudflare` ≥ 13.1.10 (CVE-2025-65019, CVE-2026-41321 class issues in the image
  endpoint). Configure `image: { service: passthroughImageService() }`, no `remotePatterns`.
- `wrangler.jsonc`: `"workers_dev": false`, `"preview_urls": false` (if the installed wrangler
  rejects `preview_urls`, remove it and note in PROGRESS that Daniel disables previews in the dashboard).
- No secrets exist in this app (Access AUD and team domain are not secret). If one is ever
  added, it goes in `wrangler secret put` by Daniel, never in the repo.

---

## 9. Privacy

- Every published photo is re-encoded client-side; originals never leave her device.
- No analytics, no third-party scripts, no cookies on the public site. If analytics are wanted
  later: Cloudflare Web Analytics (cookieless) only, added by Daniel.
- Soft-deleted content is irrecoverable after 7 days; audit log kept 365 days (emails only).
- Privacy notice page content is `TODO(client)` (her obligations toward photographed people are
  hers — the site only needs a placeholder route `/privatnost`).

---

## 10. Operations (Daniel)

- Lost laptop / suspicious activity: Zero Trust → Access → revoke sessions; remove email from
  policy and from `ADMIN_EMAILS`; redeploy.
- Backups: D1 Time Travel (restore point in time) + monthly `wrangler d1 export --remote`
  (scripts/backup.md). R2 objects are immutable by key; deletions only via purge worker.
