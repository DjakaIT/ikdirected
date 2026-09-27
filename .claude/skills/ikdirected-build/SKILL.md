---
name: ikdirected-build
description: Build loop for the ikdirected portfolio + gallery CMS repo. Use whenever working in this repository — picking the next task, implementing it, testing it, committing, pushing to build/atelier-cms, and updating docs/PROGRESS.md. Triggers on "next", "continue", "nastavi", "build", "next task", or any feature/bug work in this repo.
---

# ikdirected build loop

You are the only engineer on this project. You work in small, verified steps and leave a
precise trail so the next session (which starts with an empty context) can continue.

## The loop — one task per pass

```
1. ORIENT   read docs/PROGRESS.md (whole, it is short)
            git status && git branch --show-current   → must be build/atelier-cms
2. PICK     grep -n "^### P" docs/PLAN.md               → find current phase
            read ONLY that phase block; take the first task not marked [x] in PROGRESS
3. LOAD     open only the doc sections listed under "Load:" for that task
            (use grep -n "^## " file to find section line numbers, then Read with offset/limit)
4. DO       implement exactly the task. No drive-by refactors. No new dependencies unless the
            task names them.
5. TEST     write/extend the tests named in "Test:" FIRST when practical, then make them pass.
            While iterating: run the narrowest command (see Token discipline).
6. COMMIT   git add -A && git commit -m "<Commit: line from PLAN>"   (one concern per commit)
7. RECORD   tick the task in docs/PROGRESS.md; ≤ 3 lines of notes; decisions + blockers if any
8. REPEAT   next task in the same phase. At the last task of a phase → PHASE GATE.
```

## Phase gate (end of every phase)

```
npm run gate                       # check + test + test:e2e — all green, no skipped-without-reason
git push -u origin build/atelier-cms
```
Then in PROGRESS.md: mark the phase done, record exact versions of anything installed in that
phase, and write a 2-line "Next session starts at:" pointer. Then `/clear` is safe.

If the gate fails: fix, re-run, never push red. If a test is genuinely wrong, fix the test and
say why in the commit message. Never delete or `.skip` a test to go green.

## Token discipline (this is a requirement, not a tip)

- Never Read `reference/atelier.html` whole. DESIGN.md §3 has a line map — Read with offset/limit.
- Never re-Read a file you just wrote or edited. The tool already confirmed it.
- Prefer `grep -n` + ranged Read over opening whole files > 200 lines.
- Narrow test runs while iterating:
  `npx vitest run path/to/file.test.ts --reporter=dot 2>&1 | tail -n 30`
  `npx playwright test tests/e2e/admin-upload.spec.ts --reporter=line 2>&1 | tail -n 40`
- Full suite only at the phase gate. Pipe long output through `tail`.
- Do not paste test output or file contents into PROGRESS.md. Summaries only.
- Do not spawn subagents. Do not browse the web unless a task says "verify online".
- If the context grows heavy mid-phase: finish the current task, commit, record, then continue
  after `/clear` — PROGRESS.md is the memory.

## Definition of done (every task)

- Types pass (`npm run check` for touched area), relevant tests pass.
- Every new route/screen: axe 0 serious/critical, keyboard reachable, focus visible,
  `prefers-reduced-motion` respected, works at 360px width.
- Every new API endpoint: auth test, validation test, happy-path test (see SECURITY.md §6).
- UI copy taken verbatim from DESIGN.md §9. No invented business facts.
- Acceptance criteria IDs (`AC-*`, `SEC-*`) appear in test titles, e.g.
  `test("AC-UP-03 rejects SVG with 415", …)`.

## Guardrails

- Branch `build/atelier-cms` only. Never push `main`, never force-push, never deploy,
  never `--remote` on wrangler.
- Secrets: never read `.dev.vars`/`.env*`; use `.dev.vars.example` for names only.
- If a task conflicts with SECURITY.md, SECURITY.md wins. If it conflicts with DESIGN.md
  aesthetics vs accessibility, accessibility wins. Record the conflict in PROGRESS.md.
- Stuck twice on the same error → write it under Blockers, take the safest reversible path,
  move to the next independent task.

## PROGRESS.md format (keep it under ~120 lines total)

```
## Phase P3 — Public routes  [in progress]
- [x] P3.1 home from D1 — featured fallback works; LQIP inline
- [ ] P3.2 archive /radovi
Decisions: <one line each, dated>
Blockers: <one line each, dated>
Next session starts at: P3.2, file src/pages/radovi/index.astro
```
