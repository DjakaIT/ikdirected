# RESEARCH — why the stack and UX look like this

Open only if a decision is questioned. Sources at the bottom (checked 2026-09-27).

## 1. Platform options considered

| Option | Verdict | Reason |
|---|---|---|
| **Astro 6 + Cloudflare Workers + D1 + R2 + Access** | **chosen** | €0 within free tiers; Astro 6 runs workerd in dev, so D1/R2 bindings behave locally as in prod; no server to patch; image egress free; identity handled by a hardened proxy. Same Astro 6 line as Daniel's Septillion build. |
| Sanity (as on Septillion) | rejected | Studio is generic — breaks the "same premium language" requirement for her admin; image pipeline and pricing tied to a vendor. |
| WordPress on cyber_Folks | rejected | Largest attack surface, plugin maintenance, generic admin — the opposite of the brief. |
| Git-based CMS (Decap/Tina) | rejected | Photos in git bloat the repo; she would need a GitHub login; every upload = rebuild. |
| Custom PHP on cyber_Folks | rejected | Possible at no extra cost, but manual security hardening, no edge cache, no free object storage with zero egress. |

## 2. Auth
Cloudflare Access (Zero Trust, free ≤ 50 users) with email one-time PIN: no passwords to store,
reset, or brute-force-protect in our code. Cloudflare signs a JWT in `Cf-Access-Jwt-Assertion`;
Cloudflare's own docs say a Worker behind Access **still** must validate it (signature via team
JWKS, `aud`, `iss`) — hence SECURITY §3. Keys rotate ~every 6 weeks → remote JWKS, not pinned keys.

## 3. Images
Free Workers have ~10 ms CPU per request — no server-side decoding/resizing. So the browser does
it: `createImageBitmap` (applies EXIF orientation) → canvas → WebP. Re-encoding through canvas
drops EXIF/GPS, which also protects the people photographed (home locations). OWASP file-upload
guidance: allow-list, validate content by signature not extension/MIME, random names, store
outside the web root / separate origin, re-encode images, enforce size limits server-side — all
mapped in SECURITY §7. Older Safari may return PNG from `toBlob('image/webp')` → WASM fallback.

## 4. Gallery information architecture (the "100 events" problem)
Findings from photography-portfolio reviews: curate the homepage (roughly 15–30 images, not
everything); organise by service (weddings / portraits / events), because clients look for their
own kind of shoot; give projects real titles and one line of context; keep navigation to 5–7
items; lightbox for viewing; mixed feeds that bury the relevant work are the common failure.

Decision:
1. **Homepage stays the Atelier horizontal track**, but only for a curated "Odabrano" set
   (max 12, she picks with one menu action; auto-fill if < 4). It ends with "Sve priče (N) →".
2. **`/radovi` archive** = every album, newest first, grouped by year, category chips with
   counts (real URLs → also SEO landing pages for "fotograf vjenčanja Zadar"-type queries),
   paginated with real links + progressive "Učitaj još" + client-side search by place/title.
3. **Album page** = one event, automatic rhythm layout from aspect ratios, lightbox, prev/next.
4. **Admin mirrors that mental model**: albums first, photos inside albums, homepage is a
   selection of photos — three screens, no layout decisions.

## 5. Design direction
Apple HIG's eight principles (Purpose, Agency, Responsibility, Familiarity, Flexibility,
Simplicity, Craft, Delight) are used as review lenses, not as an iOS look. Applied as small
premium deltas to the approved Atelier file rather than a redesign (DESIGN §1, §4).

## 6. Token-efficient agent setup
- CLAUDE.md kept short (community/official guidance: under ~200 lines; every line should
  prevent a real mistake). Details moved to docs loaded per task.
- Skills load only name+description until relevant (progressive disclosure) → build loop lives in
  a skill.
- Large reference file accessed via a line map and ranged reads, never whole.
- Narrow test runs while iterating; full gate only per phase; output piped through `tail`.
- PROGRESS.md as the persistent memory so `/clear` between phases loses nothing.

## 7. Known risks
- Astro 6 / adapter v13 APIs are newer than most model training data → CLAUDE.md forces checking
  installed type definitions before use.
- R2 binding on the free Workers plan: conflicting third-party claims → flagged in SETUP.md.
- `preview_urls` wrangler key may not exist in the installed version → fallback noted.

## Sources
- Apple Design Skill (HIG principles table): https://github.com/dickwu/apple-design-skill
- Astro 6 release (workerd dev, bindings locally, CSP, Fonts API): https://astro.build/blog/astro-6/
- @astrojs/cloudflare v13 docs: https://v6.docs.astro.build/en/guides/integrations-guide/cloudflare
- Adapter CVEs: https://osv.dev/vulnerability/CVE-2025-65019 · https://osv.dev/vulnerability/CVE-2026-41321
- Cloudflare Access JWT validation: https://developers.cloudflare.com/cloudflare-one/identity/users/validating-json
- Access + one-time PIN walkthrough: https://jldec.me/blog/no-code-authentication-with-cloudflare-zero-trust-access
- R2 pricing/free tier: https://www.cloudflare.com/products/r2/
- Workers free-tier limits summary: https://agentdeals.dev/vendor/cloudflare-workers
- R2 payment method requirement: https://community.cloudflare.com/t/if-i-want-to-use-cloudflare-r2-i-have-to-link-a-payment-method-i-suggest-not-doin/887578
- Upload validation (OWASP-aligned): https://filesignature.org/guides/validate-file-type-magic-bytes
- Client-side EXIF strip via canvas: https://dev.to/will_indie/stop-sending-raw-images-to-the-cloud-the-case-for-client-side-image-manipulation-security-413e
- Portfolio IA findings: https://www.pixpa.com/blog/best-photography-portfolio-websites · https://www.pixpa.com/blog/ways-to-showcase-your-photo-gallery-on-a-portfolio-website · https://emergent.sh/learn/photography-website-features
- CLAUDE.md size / progressive disclosure: https://www.firecrawl.dev/blog/claude-code-token-efficiency · https://github.com/shanraisshan/claude-code-best-practice
