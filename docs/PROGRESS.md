# PROGRESS

Read first every session. Update last every task. Keep under ~120 lines — summaries only.

## Status
Current phase: **FE4 — Admin UI with simulated API**
Branch: `build/atelier-cms`
Order (Daniel, 2026-09-27): **front-end first with dummy data + simulated API, backend after.**
FE1 → FE2 → FE3 → FE4, then P0.3/P0.4 remainder → P2 → P3 wiring → P4 → P5 → P6 wiring → P7.
Mock data lives behind the same function signatures the D1 repositories will have, so the
backend swap touches only `src/lib/data/*`.

## Phase P0 — Bootstrap  [partly done]
- [x] P0.1 Scaffold — manual Astro 6 minimal (astro add picks v7 pkgs); build ok
- [x] P0.2 Bindings and env — wrangler.jsonc, .dev.vars.example, worker types, bindings smoke test
- [~] P0.3 Tooling — done: TS strict (astro preset), vitest 2 projects, playwright 3 projects,
      scripts dev/build/check/test/test:e2e/gate. Todo: noUncheckedIndexedAccess, eslint+prettier,
      db:migrate/db:seed scripts, webServer migrate+seed
- [ ] P0.4 CI

## FE1 — Design system, layout, content, 404  [done]
- [x] P1.1 tokens.css, base.css, Fonts API (Archivo wght+wdth, Space Mono, latin+latin-ext)
- [x] P1.3 site.ts with TODO(client) markers; release gate passes / fails with RELEASE=1
- [x] P1.2 Public layout, Seo, Nav (exactly as reference), Footer (#kontakt on every page)
- [x] P1.7 404 — e2e public-layout.spec 21/21 green (3 projects)

## FE2 — Home (P1.4 placeholders, P1.5 sections, P1.6 track/lightbox/cursor)  [done]
- [x] P1.4 placeholders only (16 scenes × 3 WebP + LQIP + og-default.jpg); attack fixtures → backend
- [x] Mock data layer src/lib/data (public.ts signatures = future D1 repos), srcset, plural, track kind
- [x] P1.5 hero, say, services (links to categories), area+marquee, FAQ, loader, JSON-LD, hero preload
- [x] P1.6 pinned lerp track + counter, native-scroll fallback, dialog lightbox (swipe), cursor dot
      Verified side by side with reference screenshots; gate green (27 unit/int, 63 e2e). JS 2.8 KB gz.
## FE3 — Archive, category, album, SEO (mock data)  [done]
- [x] P2.2 (part) dates.ts + plural.ts; slug.ts moves to backend (server-side only)
- [x] P2.5 rhythm.ts (+ tests); single tall/square rows capped at ~90svh inside their 3/11 column
- [x] P3.3 /radovi: chip bar (links), year groups, 4:5 cards + hover 2nd photo, search + live region,
      "Učitaj još" (DOM adoption of server HTML, replaceState), ?stranica validation → 404
- [x] P3.4 /radovi/[seg]: category view | album | identical 404 (SEC-ENUM-01)
- [x] P3.5 album: 88svh hero, breadcrumbs, meta sentence, story, rhythm rows, lightbox, prev/next, CTA
- [x] P3.6 JSON-LD (home, collection, gallery, breadcrumbs), sitemap.xml, robots.txt, /privatnost
      Gate green: 37 unit/int, 141 e2e (3 projects), axe clean on 6 public routes.
## FE4 — Admin UI with simulated API (P6.1–P6.7, pipeline real, upload simulated)  [next]

## Installed versions
P0: astro 6.4.8 · @astrojs/cloudflare 13.7.0 · @astrojs/preact 5.1.5 · preact 10.29.8 ·
  wrangler 4.142.0 · typescript 6.0.3 · @astrojs/check 0.9.10 · vitest 4.1.11 ·
  @cloudflare/vitest-pool-workers 0.22.0 · node 24.13.0 / npm 11.6.2
FE1: @playwright/test 1.63.0 · @axe-core/playwright 4.13.0 · @types/node 22.20.4
FE2: sharp 0.35.5

## Decisions
- 2026-09-27 Stack fixed per docs/RESEARCH.md (Astro 6 + Workers + D1 + R2 + Access).
- 2026-09-27 npm latest is Astro 7 / cloudflare 14 / preact-int 6 → pinned last Astro-6-compatible lines.
  TS 6.x (not 7: @astrojs/check peers ^5||^6); vitest 4.1.x (pool-workers peers ^4.1).
- 2026-09-27 Removed leftover Vite+React template from repo root (Daniel approved).
- 2026-09-27 compatibility_date 2026-08-20: pool-workers' bundled workerd supports ≤ 2026-08-22.
- 2026-09-27 Session driver lruCache (unused) so the adapter does not auto-provision a KV namespace.
- 2026-09-27 @types/node added (types only) — unit tests and scripts use node:fs.
- 2026-09-27 JWKS mock: pool-workers 0.22 has no `fetchMock`; use vi.spyOn(globalThis, "fetch") in P4.
- 2026-09-30 Daniel: match reference exactly → nav is brand + "Provjerite termin" only (no Radovi link).
  Paths to /radovi: hero "Pogledajte radove ↓" → gallery, "Sve priče (N) →", service cards, footer.
- 2026-09-30 Footer end: "Dizajn A — Atelier" (design-variant label) replaced by "Svi radovi" link.
- 2026-09-30 Track end card keeps reference text + PD-07 "Sve priče (N) →"; intro text computed
  ("Dvanaest fotografija iz 2023. – 2026."). Track widths per ARCHITECTURE §7.2 (reference used 26vw on mobile — bug).
- 2026-09-30 Archivo optimizedFallbacks off: → and ✕ must render from system-ui like the reference.
- 2026-09-30 a11y conflict PD-10 (.28 unrevealed words fail contrast at rest): axe runs after a
  top-to-bottom read-through; reduced motion shows full text. Accessibility wins if Daniel disagrees.
- 2026-09-30 --t-body token (16–18px) kept over reference 14px body (DESIGN §2 tokens win).
- 2026-09-30 Budgets spec (JS/CSS transfer) needs a production preview; measured manually now,
  automated in P7.3. Dev toolbar disabled.
- 2026-09-30 Album CTA links to #kontakt (contact footer is on every page) instead of /#kontakt.
- 2026-09-30 Footer end row: "Svi radovi · Privatnost" (privacy page needs a link); copy in site.ts TODO(client).
- 2026-09-30 Workers runtime types merge an HTMLRewriter `Element.append` into DOM typings →
  client code uses appendChild. Revisit if wrangler types gain a DOM-safe mode.
- 2026-09-30 Playwright + JS disabled + cross-document view transition: click stalls mid-transition
  (browser click itself works). No-JS link test runs with reducedMotion to isolate behaviour.
- 2026-09-30 AC-ARC-06 (empty category) untestable with mock data — covered after seed in P3 wiring.

## Blockers
(none)

## Waiting on Daniel / client
- Real domain, email, phone, person name, prices, FAQ answers, review quote → `src/content/site.ts`
- Category intros in site.ts are drafted from reference facts only — client must approve (TODO(client))
- Cloudflare setup (docs/SETUP.md) before first deploy

## Next session starts at
FE4 — P6.1 admin shell: `src/layouts/Admin.astro`, `src/styles/admin.css`, Toast/Dialog, mock `src/admin/api.ts`.
