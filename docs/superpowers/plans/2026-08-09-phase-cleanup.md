---
name: Phase 4-8 deferred cleanup
overview: "Close out the three genuine deferred items left over from phases 4B/5/8 per `.superpowers/sdd/minor-findings.md`: server-side per-statutory-root variance (PAY-8D), a DRY cleanup pass across the payrun SPA, and closing out the Phase 4B import \"deferred\" list (which turns out to already be fixed, needing only a verification pass + one missing test)."
todos:
  - id: setup
    content: Set up SDD workspace + progress ledger for phase-cleanup branch
    status: pending
  - id: task1
    content: "Task 1: PAY-8D server-side per-root variance (workspace.ts, employee-slide-over.tsx, employee-grid.tsx, run-diff-panel.tsx, tests)"
    status: pending
  - id: task2
    content: "Task 2: formatApiError mechanical adoption (28 sites) + isRunStatus dedup (4 sites)"
    status: pending
  - id: task3
    content: "Task 3: unify severity badge tone + extract useAsyncLoad hook and adopt in workspace/batch-drawer/findings-panel"
    status: pending
  - id: task4
    content: "Task 4: extract useDialogSubmit hook and apply to Hold/Withdraw/Distribute dialogs"
    status: pending
  - id: task5
    content: "Task 5: verify Phase 4B import deferred items, add missing empty-slug test, update minor-findings.md"
    status: pending
  - id: final
    content: Final whole-branch review + finishing-a-development-branch
    status: pending
isProject: false
---


# Complete remaining Phase 4-8 deferred work

All of Phase 4-8 is functionally shipped per `README.md`. Research (3 parallel explore passes) confirmed three genuinely open items from `.superpowers/sdd/minor-findings.md`. Everything else in that file (cognitive-complexity warnings, PCB IRBM filing pack, `ds-r1-shadcn-restoration` plan) is out of scope — either accepted debt, an external dependency (IRBM answer keys), or belongs to the old Next.js `Plan1` prototype, not this Vite SPA.

Execute via `superpowers:subagent-driven-development` with `verification-before-completion`, same pattern as Phase 8C: one branch, one progress ledger, task briefs/reports/diffs per task, final whole-branch review.

## Track A — PAY-8D: server-side statutory-root variance (real bug fix)

**Root cause** (confirmed by reading [src/repo/workspace.ts](src/repo/workspace.ts) and [src/web/payrun/employee-slide-over.tsx](src/web/payrun/employee-slide-over.tsx)): the workspace already returns per-root current/previous `sen` on `EmployeeLineDto.roots` / `previousRoots`, and a line-level `EmployeeVarianceDto` (`hasChanges`, `changedRootKeys`, `direction` — direction is net-only). But nothing computes a real `VarianceDto` (`previousSen`, `deltaSen`, `deltaBps`, `direction`) **per root**. Three client files compensate by fabricating a `VarianceDto` with `deltaSen: null, deltaBps: null` and a client-computed `direction`:

- `employee-slide-over.tsx` lines 94-107 (`directionFor()`) and 222-232 — per-row-in-slide-over badge
- `employee-grid.tsx` lines 268-277 — per-employee row badge in the grid
- `run-diff-panel.tsx` lines 40-49 — per-employee row badge in the diff summary

Because `deltaBps` is hardcoded `null`, [DeltaBadge](src/components/payroll/delta-badge.tsx) always renders **`0.0%`** for every UP/DOWN badge today — a real display bug, not just a style nit.

**Fix — extend the read facade, not the client:**

1. In [src/repo/workspace.ts](src/repo/workspace.ts), add a per-root variance builder next to `computeTileVariance` (186-195):
   ```ts
   function computeRootVariance(
     current: RootValue, previous: RootValue
   ): VarianceDto {
     const currentSen = current.sen ?? 0;
     const previousSen = previous.sen ?? 0;
     const deltaSen = currentSen - previousSen;
     return { previousSen, deltaSen, deltaBps: roundBps(deltaSen, previousSen), direction: directionOf(deltaSen) };
   }
   function computeRootVariances(
     current: Record<RootKey, RootValue>, previous: Record<RootKey, RootValue>
   ): Record<RootKey, VarianceDto> { /* map ROOT_KEYS -> computeRootVariance */ }
   ```
2. Add `rootVariances: Record<string, VarianceDto> | null` to `EmployeeLineDto` (line ~76-85); populate it in `loadWorkspaceView` alongside the existing `variance` field (null when `previousRoots === null`).
3. Mirror the new field into the client DTO twin in `src/web/api/types.ts` (and re-export via `payroll-api.ts` if that's the existing pattern for `EmployeeLineDto`).
4. `employee-slide-over.tsx`: delete `directionFor()` (94-107) and the synthetic-`VarianceDto` block (222-232); render `<DeltaBadge variance={line.rootVariances?.[key]} />` only when a real variance exists.
5. `employee-grid.tsx` (268-277) and `run-diff-panel.tsx` (40-49): replace the null-filled literal with `line.rootVariances?.net` (net is what these two already use for direction).
6. Tests — extend `tests/db/pay-run-workspace.test.ts`'s existing prior-run test (326-374) with cases: a root that increases, a root that decreases, a root that stays the same (assert real `deltaSen`/`deltaBps`, not just direction), and confirm `rootVariances` is `null` when there's no prior run.

Do **not** touch `diffGraphs`/Phase 8B run-diff (`src/domain/derive/diff.ts`) — that's a different, more expensive layer (full derivation-graph diff) serving a different route (`/lines/:lineId/diff`); reusing it here would be over-engineering for a cheap column compare that already has a working analog in `computeTileVariance`.

## Track B — DRY cleanup (mechanical + two small hooks)

Confirmed via exhaustive grep across `src/web/**`:

1. **Error-message helper** (28 call sites, all `src/web/**`): a canonical `formatApiError(error, fallback)` already exists at [src/web/api/format-error.ts](src/web/api/format-error.ts) and is used in `app.tsx`/`employees-page.tsx`/`admin-page.tsx`, but every payrun/control file still inlines `err instanceof Error ? err.message : "X failed"`. Mechanically replace all 28 sites (`workspace.tsx` x7, `findings-panel.tsx` x3, `batch-drawer.tsx` x4, `payments-panel.tsx` x4, `artifacts-panel.tsx` x2, `release-panel.tsx` x2, `control-page.tsx` x2, `client.ts`, `payslip-page.tsx`, `employee-diff.tsx`, `reports-page.tsx`) with `formatApiError(err, "X failed")`, keeping each site's existing fallback string.

2. **`isRunStatus` dedup** (4 byte-identical bodies, 2 different type-predicate spellings): `run-header.tsx:17-24`, `workspace.tsx:36-43`, `run-control-card.tsx:27-36`, `pay-run-list.tsx:28-37`. Move one canonical `isRunStatus(status): status is RunStatus` into [src/components/payroll/status-badge.tsx](src/components/payroll/status-badge.tsx) (already exports `RunStatus`), export it, delete the 4 local copies, import instead.

3. **Severity badge tone unification**: `findings-panel.tsx`'s `severityBadgeClass` (32-40) and `exception-report.tsx`'s `SEVERITY_CLASS` (4-9) both map `BLOCKING`/`WARNING`/other severities to classes but have **drifted** (different color tokens, different key sets — `exception-report.tsx` has a `REVIEW` key findings-panel doesn't). Unify into one exported `severityBadgeClass(severity)` (co-locate with `StatusBadge`, e.g. `src/components/payroll/status-badge.tsx` or a new small sibling file) using the CSS-variable classes (the more correct/consistent set), and use it from both files. Leave `pillClass` (gate pill, 1 call site), `STATE_BADGE_CLASS` (payment state, 1 call site), `rowStatusVariant` (import row status, 1 call site) alone — each maps a distinct domain concept with a single consumer; extracting them would add indirection without removing real duplication.

4. **`useAsyncLoad` hook**: new `src/hooks/use-async-load.ts` (co-located with existing `src/hooks/use-mobile.ts`) with shape `{ data, loading, error, reload }`, internally doing `setLoading(true) -> try/setData -> catch(formatApiError) -> finally setLoading(false)`. Apply to the three *load* call sites the minor-finding named: `workspace.tsx` `loadArtifacts`/`loadPayments` (121-155), `batch-drawer.tsx` `load` (56-70), `findings-panel.tsx` `loadFindings` (154-165). Leave per-action mutation handlers (`handleRecompute`, `handleClose`, dialog submits, etc.) untouched — they have bespoke busy-state/side-effect shapes that don't fit a generic "load" hook.

5. **Payment dialog boilerplate**: `HoldDialog`/`WithdrawDialog`/`DistributeDialog` in [payments-panel.tsx](src/web/payrun/payments-panel.tsx:443-728) share an identical `submitting`/`error`/try-catch-finally skeleton around three different API calls with different field state. Extract a small `useDialogSubmit()` hook (`{ submitting, error, run(fn) }`) to remove the try/catch/finally duplication, keeping each dialog's own field state (`reason`, `reasonCode`/`note`, `channel`/`note`) and markup as-is — avoid collapsing into one generic `<ActionDialog>` component, which would trade real duplication for a worse prop-explosion given the three dialogs' differing validation and field types.

## Track C — Phase 4B import "deferred" close-out (verify + 1 missing test)

Research shows **all four** items already fixed in the tree (landed in an earlier "Import header/auto-register hardening" commit range):

- Blank Base Rate → single `"required field is blank"` error only (confirmed in [src/domain/import/employee-row.ts](src/domain/import/employee-row.ts) 199-202, 234-250, with regression test at `tests/domain/employee-row.test.ts:103-116`)
- JSON header preflight already unions keys across all rows (`extractHeaders`, `src/service/employee-import.ts:219-232`)
- Slugify already throws on empty slug and suffixes collisions `_2`/`_3` (`src/service/employee-import.ts:234-239, 257-269, 295-301`)
- Auto-register tests already use isolated per-test temp seed paths (`tests/db/employee-import.test.ts:193-209`)

**Work:** run the full suite to reconfirm green, then add the one residual gap identified — a unit test asserting the empty-slug throw (e.g. header `"!!!"` → `Cannot auto-register column "!!!": slugified field key is empty`) in `tests/db/employee-import.test.ts` next to the existing auto-register tests. Update `.superpowers/sdd/minor-findings.md` to move these four items from "Deferred" to "Resolved" with the closing commit/test reference. No production-code changes expected for this track.

## Execution plan

Use subagent-driven-development with one branch/progress ledger under `.superpowers/sdd/2026-08-09-phase-cleanup/`, in this task order (independent tracks, sequential to keep diffs reviewable):

1. Task 1 — PAY-8D server + client + tests (Track A)
2. Task 2 — Error-helper + `isRunStatus` mechanical dedup (Track B.1, B.2) — lowest risk, does first
3. Task 3 — Severity badge unification + `useAsyncLoad` hook + adoption (Track B.3, B.4)
4. Task 4 — Payment dialog `useDialogSubmit` extraction (Track B.5)
5. Task 5 — Phase 4B verify + missing test + minor-findings.md update (Track C)

Each task: implement -> full test suite + `tsc --noEmit` + Biome -> diff review -> fix cycle if needed, same as Phase 8C. Final whole-branch review before finishing the branch.
