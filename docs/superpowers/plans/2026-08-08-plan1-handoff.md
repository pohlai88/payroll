# Developer Handoff — Plan 1: Control Foundation

**Date:** 2026-08-08 · **Branch:** `plan1-control-foundation` (off `master`) · **Status:** Tasks 1–9 of 10 complete and reviewed clean; Task 10 not started.

This note is for whoever picks this branch up next — a human developer or a fresh agent session with no memory of how we got here.

---

## 1. What this branch is

Implementation of [`docs/superpowers/plans/2026-08-08-plan1-control-foundation.md`](2026-08-08-plan1-control-foundation.md), which builds the spec at [`docs/superpowers/specs/2026-08-08-payrun-workspace-design.md`](../specs/2026-08-08-payrun-workspace-design.md) (Sections 1, 4, 6, plus §1.4 off-cycle and the §8.1 foundation for the transfer capability). It is the **server-side control layer only** — no new UI design. UI wiring for it is the one remaining task.

Executed via the `subagent-driven-development` skill: one fresh implementer subagent per task, one independent reviewer per task, fix-round loop on findings. Full history (dispatch prompts, reports, reviews) lives in `.superpowers/sdd/2026-08-08-plan1-control-foundation/` — **gitignored, local only**. If that directory is gone, `git log` and this note are what's left; the ledger excerpt in §4 below preserves the load-bearing decisions.

## 2. What's done (Tasks 1–9, all reviewed clean)

| # | Task | Key commits | What it built |
|---|---|---|---|
| 1 | Persons + run membership | `99dcc53`, `542dca3` | `persons` table (one person, many employments), `employmentOverlapsPeriod()` — pay runs now include employees by employment-period overlap, not a raw ACTIVE flag |
| 2 | Lifecycle v2 | `17616c9` | Run status is now `DRAFT → REVIEWED → APPROVED → CLOSED` (PAID retired, legacy rows migrated); off-cycle columns; partial unique index so off-cycle runs coexist with the regular run in a period |
| 3 | Calc revision | `a0e9e73`, `7477b34` | `calcRevision` — canonical hash of calculation-relevant state; REVIEWED certifies a revision; any calc-affecting edit after REVIEWED atomically demotes the run to DRAFT (same transaction as the edit) |
| 4 | Findings engine core | `afee8e8`, `de890bd` | `anomaly_findings` / `finding_events` — evidence-fingerprinted findings with OPEN/ACKNOWLEDGED/RESOLVED lifecycle; acknowledgment is bound to evidence and reopens if the underlying facts change |
| 5 | Rule catalog + gates | `c2c3c9e`, `b26416f` | Full §4.3 rule catalog (15 rules), `evaluateGate(runId, gate)` for REVIEW/APPROVAL/RELEASE/CLOSE, `gate_certifications`. **Findings freeze at APPROVED/CLOSED** — reading a page never mutates the certified record |
| 6 | Payment state machine | `b47266d`, `d572d31` | `line_payments` + `withdrawals` — READY/HOLD/RELEASED/PAID/FAILED_RETURNED/RECONCILED/WITHDRAWN, centralized transition table in `src/server/payments.ts`; PAID can never become WITHDRAWN |
| 7 | Artifacts + release | `368f886`, `b416e23` | `artifacts` (hashed files on disk under `data/runs/<runId>/`), `release_batches` + immutable `payment_attempts`, generic payment register CSV. Live bank-detail re-validation at release time (closes a real gap — see §5) |
| 8 | Off-cycle runs | `09e2efe` | `createOffcycleRun()` — one-off runs (correction/arrears/bonus/missed/final payment) for selected employees only, coexisting with the regular monthly run |
| 9 | Reconciliation + closure | `2e78208`, `e259d40` | `distributions`, `closureChecklist()`, `closeRun()` — sealed `manifest.json` with hash stored in `pay_runs` and lock triggers on the artifacts row itself. **See §5 for a real bug this task fixed** |

**Test suite: 136/136 passing** (`npx vitest run`), including the original 84-test golden master reproducing the July 2026 payroll to the sen — **untouched** throughout; `src/lib/calc/*` was never modified by any of these nine tasks. `npx tsc --noEmit` is clean.

Run this to verify the branch is exactly as described before doing anything else:
```bash
git log --oneline master..HEAD    # should show the 18 commits above (9 feat + 9 fix, roughly)
npx vitest run                     # 136 passed
npx tsc --noEmit                   # clean
```

## 3. What's NOT done

**Task 10 (final task of Plan 1) was about to be dispatched and was stopped before starting** — nothing from it exists yet. It covers:

1. Nine new server actions in `src/app/actions/payruns.ts` wrapping the Tasks 5–9 services: acknowledge finding, hold/withdraw line, preview/commit release, settle attempt, reconcile attempt, record distribution, close run.
2. Minimal UI in `src/components/payrun-grid.tsx`: a findings panel with inline acknowledge, a read-only payment-state indicator, small hold/withdraw forms, a release-selected flow, and a close button that shows the `closureChecklist()` before allowing the action.
3. An extended `scripts/e2e-check.ts` walking the full lifecycle headlessly on the July 2026 fixture: verify PCB → approve → release (one line held) → settle mixed (one fails) → retry → withdraw the held line into a replacement off-cycle run → distribute → reconcile → close → assert the manifest and post-close locks.
4. A README update replacing "mark paid" language with the real lifecycle.

The full task brief (already extracted, ready to hand to an implementer) is at:
`.superpowers/sdd/2026-08-08-plan1-control-foundation/task-10-brief.md`

**Beyond Task 10**, three more plans exist only as concepts (not yet written as plan documents), per the spec decomposition agreed during brainstorming:
- Plan 2: Workspace UI (the real cockpit page — stepper/grid/rail/sheet/dialog system from spec §2/§3/§7)
- Plan 3: Teaching payslip (spec §5 — two-page document, YTD openings, typed calculation trace)
- Plan 4: Internal company transfer (spec §8 — the person/employment split Task 1 laid the groundwork for)

## 4. Decisions a future session must know about

These are things that aren't obvious from the code alone.

### 4.1 A real bug was found and fixed in Task 9 — know this before touching closure/release code

The plan brief said `closureChecklist` item 3 requires "every batch status ∈ {SETTLED, CANCELLED}". Implemented literally, this made **any run that ever had a single failed-then-successfully-retried bank payment permanently unclosable** — not a theoretical edge case, a routine payroll occurrence (closed accounts, name mismatches). The reviewer proved `PARTIALLY_SETTLED` was an absorbing state with no exit path anywhere in the code.

I adjudicated this in favor of the design spec (§10's own required end-to-end test explicitly includes this retry scenario reaching CLOSED; §1.5's actual wording is "terminal status," not literal enum membership) over the plan brief's imprecise paraphrase. The fix adds a new terminal batch status, `SETTLED_WITH_FAILURES` (batch fully settled, zero pending, but with a recorded failure — never silently relabeled as clean `SETTLED`). A migration backfill (`0007_close_seal.sql`) also corrects any pre-existing stuck batches in `data/payroll.db` if the app had been used before this fix landed (verified empirically not to touch batches with genuinely live obligations).

**If you're extending release/closure logic**, `SETTLED_WITH_FAILURES` is now a real, distinct, permanent status — don't special-case `SETTLED` and `CANCELLED` only and forget it.

### 4.2 Findings freeze once a run is APPROVED

`scanRun`/`scanLine` (src/server/gates.ts) are no-ops once `run.status` is `APPROVED` or `CLOSED`. This is deliberate (spec: approval certifies a disposition set; a later dashboard render or employee-data edit must never silently rewrite what was approved) but it means **if you add a new anomaly rule, it will never fire retroactively on an already-approved run** — only on runs still in DRAFT/REVIEWED. This is correct per spec, just easy to be confused by while debugging "why didn't my new rule fire on this test run."

### 4.3 Two service-layer boundaries are load-bearing, not incidental

- `src/server/payments.ts` owns the **entire** `line_payments` state machine as one transition table (`PAY_TRANSITIONS`) and one pattern (load → assert → update → audit, all inside one `sqlite.transaction()`). `release.ts` and `close.ts` never write `line_payments` directly — they call `payments.ts` functions (`releaseLine`, `settleLine`, `reconcileLine`, `returnToReady`). This was enforced twice in review (Task 6's original fix-round finding, verified again structurally in Task 7 and Task 9). **Keep this boundary** — it's what makes the state machine auditable in one place instead of scattered.
- `payment_attempts` rows are treated as immutable history at the service layer (an attempt leaves PENDING exactly once; retries create new rows, never mutate old ones). There is **no DB trigger enforcing this yet** — it's application-level discipline only, flagged in the ledger as a Task 9+ follow-up (a natural fit for whoever builds Plan 2's UI, or a small standalone hardening task).

### 4.4 `gates.ts`'s `BANK_DETAILS_CHANGED` rule reads raw SQL against `payment_attempts`

It expects columns `line_id`, `status = 'PAID'`, `bank_snapshot` (JSON text), `settled_at`, wrapped in a `sqlite_master` existence guard + try/catch that silently returns null on any shape mismatch. This was flagged twice across tasks (Task 5 → Task 7) because a column rename would silently disable a release-blocking rule forever with zero signal. It's now tested (Task 7's fix round added coverage), but **if you rename any `payment_attempts` column, grep `gates.ts` for `payment_attempts` first** — nothing else will tell you it broke.

### 4.5 A concurrent UI/design session is mid-flight in this same working tree

**As of this handoff, the working tree has substantial uncommitted changes from a separate design session** ("Straits palette" / shadcn restoration) — visible in `git status`. This branch's nine completed tasks were all committed carefully to avoid touching those files (implementers were instructed to `git status` first and stage narrowly). Before starting Task 10 or anything else:

```bash
git status --short
```

Check what's still uncommitted. If it's the same design work, **do not discard it** (no `git stash` you don't intend to pop, no `git checkout --`, no `git reset --hard`). Task 10 specifically touches `src/app/page.tsx` and `src/app/payruns/[id]/page.tsx`, both of which were mid-flight-modified by that other session at the time this was paused — the Task 10 brief already contains explicit instructions (`git add -p` on those two files only, never `git commit -a`) to avoid sweeping in unrelated changes. Re-read that guidance in the brief before dispatching.

### 4.6 Deferred (parked) findings — not bugs, just known and intentionally not fixed yet

Full detail is in the ledger (`.superpowers/sdd/2026-08-08-plan1-control-foundation/progress.md`, if it still exists) but the ones most likely to matter to future work:

- **RELEASE gate has no per-line payment-state prerequisite** (a HOLD or already-RELEASED line isn't blocked by the *gate* itself — `previewRelease`'s own exclusion logic happens to cover this correctly today, but the gate/prerequisite layer doesn't independently assert it). Flagged from Task 5 through Task 9, never picked up — a good candidate for a small standalone task.
- `payment_attempts`/`line_payments` immutability is service-level only, no DB trigger (see §4.3).
- `pay_runs.closed_manifest_sha256` itself has no CLOSED-scoped lock trigger — the `artifacts` row referencing it is locked, but the column on `pay_runs` technically isn't. Low priority; the practical tamper surface is already closed by the artifacts trigger.
- `src/app/actions/payruns.ts`'s existing `transitionRunAction` doesn't yet pass a real `actor` through to `transitionRun` for the CLOSE case — Task 9 added the *capability* (the function accepts an actor param and uses it correctly), but the current UI action still falls back to the company's configured approver name rather than a real operator identity. **Task 10 should wire this properly** — it's literally in Task 10's action list (`closeRunAction`).
- Several rule-catalog edge cases have looser tolerances than the spec's exact wording (e.g. `STATUTORY_STEP_SHIFT` fires on any band-step change within a wage-similarity window rather than literally ">1 band step") — pragmatic implementer choices, disclosed and accepted in review, not reopened.

None of these block Task 10 or later plans; they're recorded so nobody "rediscovers" them as if new.

## 5. How to resume

1. `git status` — confirm the concurrent design session's state (§4.5) before doing anything.
2. Confirm the branch is clean per §2's verification commands.
3. If continuing with subagent-driven-development: the Task 10 brief is already extracted at `.superpowers/sdd/2026-08-08-plan1-control-foundation/task-10-brief.md`. The ledger at `progress.md` in that same directory has the full task-by-task history if you want the granular record rather than this summary.
4. If the `.superpowers/sdd/...` workspace has been cleaned up (it's gitignored scratch, expected to be deleted once the plan's final review is clean and merged — which hasn't happened yet, so it should still be there), regenerate context from `git log -p` on the branch and this note.
5. After Task 10: a final whole-branch code review (most capable model) against `merge-base master HEAD`, one fix wave if needed, then `finishing-a-development-branch` to decide how this merges to `master`.

## 6. Files worth reading first if you're new to this

- `docs/superpowers/specs/2026-08-08-payrun-workspace-design.md` — the frozen design spec, authoritative over the plan brief's paraphrasing (see §4.1 above for why that distinction matters).
- `docs/superpowers/plans/2026-08-08-plan1-control-foundation.md` — the task-by-task plan this branch implements.
- `src/server/payments.ts`, `src/server/gates.ts`, `src/server/close.ts` — the three files that carry the most control-flow judgment; read these before extending anything payment- or closure-related.
- `tests/service/close.test.ts` — has the fullest single-file narrative of a run's lifecycle end to end; useful as executable documentation.
