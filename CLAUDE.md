<!-- Router file. Keep under 100 lines. Details live in docs/ and load on demand. -->
# ikdirected — portfolio + gallery CMS

Photographer portfolio for **ikdirected** (Zadar, HR): weddings, events, portraits, drone.
Public site in the "Atelier" design (dark, cinematic, horizontal gallery) + a private `/admin`
where the photographer creates albums and uploads/deletes/reorders photos herself.

## Stack (decided — do not re-litigate, see docs/RESEARCH.md)
Astro 6 · @astrojs/cloudflare ≥ 13.1.10 (Workers, not Pages) · Cloudflare D1 (data) ·
R2 (images, served from `media.` subdomain) · Cloudflare Access (auth, email one-time PIN) ·
Preact islands **only in /admin** · vanilla TS on public pages · Vitest + @cloudflare/vitest-pool-workers ·
Playwright + @axe-core/playwright · TypeScript strict · zod via `astro/zod`.

## How to work in this repo
1. Use the skill `.claude/skills/ikdirected-build/SKILL.md` (or run `/next`). It is the build loop.
2. State lives in `docs/PROGRESS.md`. Read it first, every session. Update it last, every task.
3. Load only the doc sections the current task lists under **Load:** in `docs/PLAN.md`.

## Docs map (open only what the task needs)
| File | Holds | Open when |
|---|---|---|
| docs/PROGRESS.md | current phase, done tasks, decisions, blockers | always, first |
| docs/PLAN.md | phases → tasks → Load/Do/Test/Commit | always, current phase only |
| docs/SPEC.md | features + acceptance criteria `AC-*` | building or testing a feature |
| docs/DESIGN.md | tokens, premium deltas, page + admin designs, copy | any UI work |
| docs/ARCHITECTURE.md | tree, D1 schema, API contract, upload pipeline | any server/data work |
| docs/SECURITY.md | threat model, controls, headers, `SEC-*` tests | auth, upload, API, headers |
| docs/TESTING.md | commands, fixtures, e2e auth, CI | writing or running tests |
| docs/SETUP.md | Cloudflare setup for Daniel (Croatian) | never — human doc |
| docs/RESEARCH.md | why these choices, sources | only if a decision is questioned |
| reference/atelier.html | approved design, 581 lines | **never whole** — use line map in DESIGN.md §3 |

## Commands (created in phase P0)
```
npm run dev            # astro dev on workerd, local D1/R2
npm run check          # astro check + tsc --noEmit + eslint
npm run test           # vitest (unit + workers integration)
npm run test:e2e       # playwright (starts dev server, local bindings)
npm run db:migrate     # wrangler d1 migrations apply ikdirected --local
npm run db:seed        # scripts/seed.mjs → local D1 + R2 fixtures
npm run gate           # check + test + test:e2e  (phase gate, must be green to push)
```

## Hard rules
- **Git:** work on branch `build/atelier-cms`. Never commit to or push `main`. Never force-push.
  Conventional commits (`feat(admin): …`, `test(api): …`). One concern per commit.
  Push only after `npm run gate` is green.
- **Never deploy.** No `wrangler deploy`, no `--remote`. Daniel deploys (docs/SETUP.md).
- **Never invent business facts** (prices, phone, email, real name, places, reviews).
  Unknowns live in `src/content/site.ts` marked `TODO(client)`. A release test enforces this.
- **Never** read `.dev.vars`, `.env*`, or print secrets. Never commit them.
- Public pages ship **no framework JS**. Budget: ≤ 30 KB gz JS per public page.
- All SQL via `env.DB.prepare(...).bind(...)`. No string-built SQL. Ever.
- Never render user text with `set:html`. Astro escapes by default — keep it that way.
- No server-rendered `style="…"` attributes on public pages (strict CSP). Classes + width/height.
- Images: never accept SVG, never serve uploads from the app origin, never trust client MIME.
- Accessibility is a gate, not polish: axe must report 0 serious/critical on every route.
- Astro 6 differs from what you were trained on. Before using an Astro or adapter API, confirm it
  in `node_modules/astro/dist/**/*.d.ts` or `node_modules/@astrojs/cloudflare/README.md`.
  Known: `Astro.locals.runtime` is gone → `import { env } from "cloudflare:workers"`.
  If still unsure, say so in PROGRESS.md blockers and pick the conservative path.

## Language
Code, comments, commit messages: English. **All UI copy: natural Croatian** (strings are in
docs/DESIGN.md §9 — use them verbatim). Admin and public share one design language.

## When stuck
Write one line under **Blockers** in docs/PROGRESS.md, choose the safest reversible option,
continue with the next independent task. Do not loop on the same failure more than twice.
