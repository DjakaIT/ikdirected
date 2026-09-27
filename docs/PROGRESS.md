# PROGRESS

Read first every session. Update last every task. Keep under ~120 lines — summaries only.

## Status
Current phase: **FE2 — Home page (static, placeholder data)**
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
- [x] P1.2 Public layout, Seo, Nav (+ "Radovi" link), Footer (#kontakt on every page)
- [x] P1.7 404 — e2e public-layout.spec 21/21 green (3 projects)

## FE2 — Home (P1.4 placeholders, P1.5 sections, P1.6 track/lightbox/cursor)  [next]
## FE3 — Archive, category, album with mock data (P2.2 text utils, P2.5 layouts, P3.1, P3.3–P3.5)
## FE4 — Admin UI with simulated API (P6.1–P6.7, pipeline real, upload simulated)

## Installed versions
P0: astro 6.4.8 · @astrojs/cloudflare 13.7.0 · @astrojs/preact 5.1.5 · preact 10.29.8 ·
  wrangler 4.142.0 · typescript 6.0.3 · @astrojs/check 0.9.10 · vitest 4.1.11 ·
  @cloudflare/vitest-pool-workers 0.22.0 · node 24.13.0 / npm 11.6.2
FE1: @playwright/test 1.63.0 · @axe-core/playwright 4.13.0 · @types/node 22.20.4

## Decisions
- 2026-09-27 Stack fixed per docs/RESEARCH.md (Astro 6 + Workers + D1 + R2 + Access).
- 2026-09-27 npm latest is Astro 7 / cloudflare 14 / preact-int 6 → pinned last Astro-6-compatible lines.
  TS 6.x (not 7: @astrojs/check peers ^5||^6); vitest 4.1.x (pool-workers peers ^4.1).
- 2026-09-27 Removed leftover Vite+React template from repo root (Daniel approved).
- 2026-09-27 compatibility_date 2026-08-20: pool-workers' bundled workerd supports ≤ 2026-08-22.
- 2026-09-27 Session driver lruCache (unused) so the adapter does not auto-provision a KV namespace.
- 2026-09-27 @types/node added (types only) — unit tests and scripts use node:fs.
- 2026-09-27 JWKS mock: pool-workers 0.22 has no `fetchMock`; use vi.spyOn(globalThis, "fetch") in P4.
- 2026-09-27 Nav gets a "Radovi" link (multi-page site); footer/contact block renders on every page.

## Blockers
(none)

## Waiting on Daniel / client
- Real domain, email, phone, person name, prices, FAQ answers, review quote → `src/content/site.ts`
- Category intros in site.ts are drafted from reference facts only — client must approve (TODO(client))
- Cloudflare setup (docs/SETUP.md) before first deploy

## Next session starts at
FE2 — `scripts/make-fixtures.mjs` placeholders (sharp), then home sections in `src/pages/index.astro`.
