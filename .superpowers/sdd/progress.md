# SDD Progress Ledger — Phase 2 Persistence Closeout

Plan: docs/superpowers/plans/2026-08-08-phase2-persistence.md
Branch: phase2-persistence
Note: bash unavailable (no WSL); task-brief/review-package done manually.

## Pre-flight scan

Scanned plan for internal contradictions and Global Constraints conflicts: none found. Proceeding.
Working in place on existing feature branch (same as prior SDD session).

## Tasks


Task 1: complete (commits f14363b..151f961, review Approved)
- Deviation (accepted): also DROP SCHEMA drizzle CASCADE for Drizzle 0.45 journal.
- Minor (logged): plan brief still shows public-only drop; harness pool after reset optional hardening.


Task 2: complete (commits 151f961..e78b865, review Approved with accepted Extra)
- Extra (accepted): commit also included pre-existing WT architecture sync (transfer §2.2a, enums, payslip link) beyond the two brief replacements; content accurate.


Task 3: complete (no commit, ops smoke, review Approved)



Task 4: in progress — executing sibling plan Tasks 3–8 of employee-master-import.md


Import Task 3: complete (e78b865..b9b07e2, review Approved)
- Minor: negative base rate not rejected at parse; duplicate blank Base Rate errors; biome complexity.


Import Task 4: complete (b9b07e2..fd393fd, review Approved)
- Important (fix before Task 5): employee-row.ts boolean typecheck errors.


Import Task 3 typecheck fix: 38dce68 (review deferred with Task 5)


Import Task 5: complete (38dce68..4e0bad4, review Approved)


Import Task 6: complete (4e0bad4..1d534a8, review Approved)
- Minor: brief column-count typo (40 vs 41 FIXED_HEADERS); commit may have bundled hono/jose in package.json — verify at final review.

## Phase 3 stabilize (living docs + light auth hygiene) — CLOSED / FROZEN

Spec: `docs/superpowers/specs/2026-08-08-phase3-stabilize-docs-design.md`

Auth platform + living docs aligned; Plan1 left historical; `.env.local` load +
injected `requireServerEnv` fixed; targeted tests green. No further work in this
slice. Next work should be a product/architecture vertical, not more auth polish.


Import Task 7 + header-preflight: complete (1d534a8..8c10f7d, review Approved)
- Minor: JSON first-row headers only; slugify collisions; auto-register may append duplicate seed entries from tests — check seed file.


Import header/auto-register hardening: 8c10f7d..60a27a1 (seed isolation Approved by controller)
Import Task 8: in progress (full suite)


Import Task 8: complete (cb54a93, 785/785, typecheck+lint pass, review Accepted by controller)
Task 4 (closeout): complete — sibling import Tasks 3–8 + header-preflight done


Task 5: complete (gate green; README landed in c2b95ce)
- Gate: typecheck 0; ultracite check on the Phase 2 surface 0 errors (8 pre-existing
  complexity warnings); domain 572/572; db 213/213.
- Fix required by the gate: 993538f — `tests/db/reset-script.test.ts` ran a full
  DROP SCHEMA + 16 migrations + seed (~8s under vitest) against vitest's 5s
  default and timed out; the in-flight pool then held the harness advisory lock
  into the next run. Given an explicit 60s budget; global default left low.
- README (Step 2/3) was committed as c2b95ce by a concurrent session, with the
  plan's replacement text verbatim — no edit left to make. Note it landed while
  the db suite was still red; 993538f is what makes the "done" claim true.
- Concurrent Phase 4A work (`src/web/**`, `index.html`, `vite.config.ts`,
  `tests/domain/api-client.test.ts`, package.json vite deps) arrived in this tree
  mid-gate and is the only source of repo-wide `npm run check` errors. Not Phase 2.

Phase 2 closeout plan: all 5 tasks complete.


Task 5: complete (cb54a93..c2b95ce, review pending)


Task 5: complete (cb54a93..c2b95ce, review Approved with accepted Extra)
All closeout tasks complete. Final review in progress.


Final review: Ready to merge (I-1 fixed in 56e0ed5). Minors deferred: JSON header union, slugify collisions.



# SDD Progress Ledger - Phase 4C Straits/shadcn

Plan: docs/superpowers/plans/2026-08-08-phase4c-straits-shadcn.md
Branch: phase2-persistence
Base before Task 1: 7e637468b8f0e699baa6f32a71096d145a236b74
Note: bash unavailable; task-brief/review-package done via PowerShell.

## Tasks


Task 1: complete (commits 7e63746..3b962c8, review Approved)
- Minor: label Studio catalog gap; confirm on add in Task 2/4.

Task 2: complete (commits 3b962c8..fa95c50, review Approved)
- Minor: untracked button.tsx for Task 4; --sidebar-* CSS until Task 3.

Task 3: complete (commits fa95c50..5f5a6e5, review Approved)
- Minor: trailing newline; dark chart remap deferred.

Task 4: complete (commits 5f5a6e5..86b234e, review Approved after evidence fix)
- Minor: table use client directive; button skip wording.

Task 5: complete (commits 86b234e..474ad09, review Approved after foundation fix)
- Important carried: npm run build/typecheck red on pre-existing files; Task 6 must clear.
- Fix commits: d7830bb web auth/api entry; 474ad09 UI format.

Task 6: complete (commits 474ad09..605b489, review Approved after gate-evidence fix)
- Phase 4C check gate = biome src/web src/components; full-repo check pre-existing red.
- Minor: manual smoke operator; report count staleness.

Final minor fix: 1d317a2 (table use client, sidebar tokens, theme toggle label)


# SDD Progress Ledger — Phase 8C Reports Portal

Plan: docs/superpowers/plans/2026-08-09-phase8c-reports.md
Branch: phase2-persistence
Base before Task 1: d9763fd6164712012e865d34a60814da0abfbba5
Note: bash unavailable; task-brief/review-package done via PowerShell.

## Pre-flight scan

Scanned plan (3 tasks) for internal contradictions and Global Constraints conflicts: none found. Proceeding.

## Tasks

Task 1: complete (commits 55674d3..318c7bb, review Approved)
- Note: an unrelated concurrent commit 55674d3 (Phase 8B run-diff route, not part of this plan)
  landed on the branch during dispatch; review base adjusted to exclude it from the diff.
- Minor (logged): statutory `sum()` helper key type not narrowed to numeric columns
  (pay-run-reports.ts:144); exception report loads all run lines instead of filtering by
  lineIds (pay-run-reports.ts:196); exception report test doesn't seed a finding to exercise
  enrichment path.

Task 2: complete (commits de13ce0..763ad50 implement, b9b6283..a2a61ac fix, review Approved after fix)
- Note: further unrelated concurrent commits (Phase 8B compare panel/diff tab, lint cleanup,
  docs reconciliation) landed on the branch during dispatch; review bases adjusted each time
  to isolate this task's own commits.
- Important (fixed): `months`/`runsIncluded` were scoped to all company-level eligible runs
  instead of the employee's actual pay lines; fixed in a2a61ac with a regression test for an
  approved run with no pay line for the employee.
- Minor (logged, not fixed): employeeCode/employeeName from snapshot is non-deterministic on
  iteration order (no ORDER BY); year param accepts "2026.0"-style strings (benign).

Task 3: complete (commits a703b27..3c1a67e implement, 3c1a67e..923224c fix, review Approved after fix)
- Note: further unrelated concurrent commits (employee-diff deltaSen fix, repo-wide lint
  cleanup) landed during dispatch; review bases adjusted to isolate this task's own commits.
- Important (fixed): payment-register Print button used `onClick={window.print}` (detached
  `this` binding bug); client.ts report endpoints typed `<any>` with unsafe `as` casts in
  payroll-api.ts. Fixed in 923224c — arrow-wrapped print handler, DTOs moved to types.ts and
  client.ts methods typed concretely, casts removed.
- Minor (logged, not fixed): URL state is read-at-mount only, not bidirectionally synced as
  sidebar/picker selections change (no browser back/bookmark support mid-session).
- Full suite at close: 918/918 passing, tsc 0 errors.

All 3 tasks complete. Proceeding to final whole-branch review.
