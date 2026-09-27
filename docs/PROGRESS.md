# PROGRESS

Read first every session. Update last every task. Keep under ~120 lines — summaries only.

## Status
Current phase: **P0 — Bootstrap** (in progress)
Branch: `build/atelier-cms`

## Phase P0 — Bootstrap  [in progress]
- [x] P0.1 Scaffold on the branch — manual Astro 6 minimal (astro add picks v7 pkgs); build ok
- [ ] P0.2 Bindings and env
- [ ] P0.3 Tooling and scripts
- [ ] P0.4 CI

## Installed versions
P0: astro 6.4.8 · @astrojs/cloudflare 13.7.0 · @astrojs/preact 5.1.5 · preact 10.29.8 ·
  wrangler 4.142.0 · typescript 6.0.3 · @astrojs/check 0.9.10 · node 24.13.0 / npm 11.6.2

## Decisions
- 2026-09-27 Stack fixed per docs/RESEARCH.md (Astro 6 + Workers + D1 + R2 + Access).
- 2026-09-27 npm latest is Astro 7 / cloudflare 14 / preact-int 6 → pinned last Astro-6-compatible lines.
  TS 6.x (not 7: @astrojs/check peers ^5||^6); vitest 4.1.x (pool-workers peers ^4.1).
- 2026-09-27 Removed leftover Vite+React template from repo root (Daniel approved).

## Blockers
(none)

## Waiting on Daniel / client
- Real domain, email, phone, person name, prices, FAQ answers, review quote → `src/content/site.ts`
- Cloudflare setup (docs/SETUP.md) before first deploy

## Next session starts at
P0.2 — wrangler.jsonc bindings, env types, astro.config.
