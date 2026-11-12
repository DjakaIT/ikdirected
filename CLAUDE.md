# ikdirected — portfolio + gallery CMS

Photographer portfolio for **ikdirected** (Zadar, HR): weddings, events, portraits, drone.
Public site in the "Atelier" design (dark, cinematic, horizontal gallery) + a private `/admin`
where the photographer creates albums and uploads/deletes/reorders photos herself.

## Stack (Daniel, 2026-11-10: Hostinger instead of Cloudflare — see docs/ARCHITECTURE.md §1)
Astro 6 **static output** (no Node at runtime) · admin API in **PHP 8.1+** (`api/`, no framework, no database:
JSON store outside `public_html`) · hosting **Hostinger Unlimited** (LiteSpeed/Apache, `.htaccess`) ·
GitHub Actions builds the site from the admin's public export and commits it to branch `hosting`, which hPanel
Git deploys into `public_html` (model:
CamelliaSinensis "uredništvo") · sign-in: password + TOTP, invites (ported from CamelliaSinensis) ·
Preact islands **only in /admin** · vanilla TS on public pages · Vitest (unit + PHP API on `php -S`) ·
Playwright + @axe-core/playwright against the built site · TypeScript strict.

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
| docs/ARCHITECTURE.md | hosting shape, tree, store, API contract, upload, publishing | any server/data work |
| docs/SECURITY.md | threat model, controls, headers, `SEC-*` tests | auth, upload, API, headers |
| docs/TESTING.md | commands, local PHP, fixtures, e2e, CI | writing or running tests |
| docs/SETUP.md | Hostinger + Porkbun + GitHub setup for Daniel (Croatian) | never — human doc |
| docs/VODIC.md | admin guide for the photographer (Croatian) | never — human doc |
| docs/RESEARCH.md | why the original choices, sources | only if a decision is questioned |
| reference/atelier.html | approved design, 581 lines | **never whole** — use line map in DESIGN.md §3 |

## Commands
```
npm run dev            # astro dev :4321 + PHP admin API :8787 (proxied), data in .local/
npm run build          # static site → dist/ (IK_SADRZAJ=<export.json> for real content, else demo)
npm run build:local    # build from the local admin's export (.local/podaci/izvoz.json)
npm run preview        # dist/ + PHP API exactly as on the hosting (scripts/serve.mjs)
npm run check          # astro check + tsc
npm run test           # vitest: unit + PHP API (needs dist/ — run build first)
npm run test:e2e       # playwright (builds, then serves dist/ + PHP with IK_TEST=1)
npm run paket          # hosting/ + hosting.zip = content of public_html (after build)
npm run gate           # check + build + test + test:e2e  (must be green to push)
```
PHP for local runs: `.tools/php/` (portable PHP 8.4, git-ignored; docs/TESTING.md §3) or `PHP_BIN`.

## Hard rules
- **Git:** work on branch `build/atelier-cms`. Never commit to or push `main`. Never force-push.
  Conventional commits (`feat(admin): …`, `test(api): …`). One concern per commit.
  Push only after `npm run gate` is green.
- **Never deploy.** No uploads to the hosting, no GitHub variables/secrets/tokens, never enable
  `OBJAVA_UKLJUCENA`. Daniel does all of it (docs/SETUP.md).
- **Never invent business facts** (prices, phone, email, real name, places, reviews).
  Unknowns live in `src/content/site.ts` marked `TODO(client)`. A release test enforces this.
- **Never** read `.dev.vars`, `.env*`, admin data folders (`ikdirected-podaci/`, `.local/podaci/`), or print
  secrets/tokens. Never commit them.
- Public pages ship **no framework JS**. Budget: ≤ 30 KB gz JS per public page.
- No database. Content changes go through `Store::mutate()` (one lock, fresh read, atomic write). Paths are
  never built from user input — only from ids the server generated and checked with `is_uuid()`.
- Never render user text with `set:html`. Astro escapes by default — keep it that way.
- No server-rendered `style="…"` attributes on public pages (strict CSP). Classes + width/height.
- Images: never accept SVG, never decode or transform uploads on the server (parse the WebP container only),
  uploads live outside `public_html` (`ikdirected-podaci/media`) and are sent only by `media/index.php`; nothing that
  must survive a deploy may live in `public_html`; never trust client MIME.
- PHP must run on **PHP 8.1** (Hostinger lets the version change): no 8.2+ syntax.
- `.htaccess` rules and `scripts/dev-router.php` (their local emulation) change together.
- Accessibility is a gate, not polish: axe must report 0 serious/critical on every route.
- Astro 6 differs from what you were trained on. Before using an Astro API, confirm it in
  `node_modules/astro/dist/**/*.d.ts`. If still unsure, say so in PROGRESS.md blockers and pick the
  conservative path.

## Language
Code, comments, commit messages: English. **All UI copy: natural Croatian** (strings are in
docs/DESIGN.md §9 — use them verbatim). Admin and public share one design language.

## When stuck
Write one line under **Blockers** in docs/PROGRESS.md, choose the safest reversible option,
continue with the next independent task. Do not loop on the same failure more than twice.
