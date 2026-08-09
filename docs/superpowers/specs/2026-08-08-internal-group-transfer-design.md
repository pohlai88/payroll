# Internal group transfer — MVP design

Spec of record for the cross-company employee transfer capability. Narrows
§8.3–8.4 of [pay-run workspace design](./2026-08-08-payrun-workspace-design.md).
Follow-up slice
[transfer-statutory-followups](./2026-08-08-transfer-statutory-followups-design.md)
adds artifacts-backed evidence and §8.6 findings.

## Scope

**In scope:** ending an employment at Company A and creating a linked
employment at Company B for the same person, with service-date continuity and
prior-employer YTD capture for PCB continuity; `evidenceArtifactId` on
transfers / prior YTD; post-commit and run-scoped §8.6 transfer findings.

**Out of scope, deferred:**
- Same-company department/designation change (§8.2, `employment_changes`) —
  unrelated feature, no schema today models department/designation at all.
- The wizard UI and a persisted `DRAFT` transfer state — every `transfers` row
  this MVP writes is already committed.
- Company rename — not a transfer; a plain `UPDATE companies SET name = ...`.

**Shipped after MVP (follow-ups design):**
- §8.6 findings rules (`TRANSFER_OVERLAP_DATES`, `PERSON_IN_BOTH_EMPLOYERS`,
  etc.) via `src/domain/findings/transfer-rules.ts` + `scanTransferFindings` /
  `scanRunTransferFindings`.
- Evidence via `artifacts` + `storeAttachedEvidence`; `evidenceRef` is deprecated.

## Data model

### `termination_reason` enum (new)

`src/db/schema/enums.ts`:

```
RESIGNATION | DISMISSAL | CONTRACT_END | INTERNAL_GROUP_TRANSFER | RETIREMENT | OTHER
```

`employments.terminationReason` changes from free `text()` to this enum.
Currently null on every row, so the migration is lossless.

### `employments.priorEmploymentId` (new column)

`uuid`, nullable, self-referencing FK to `employments.id`. Set on the
*receiving* employment (Employment B), pointing at the *ended* one
(Employment A).

### `transfers` (new table)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `personId` | uuid fk `persons` | |
| `fromEmploymentId` | uuid fk `employments` | Employment A |
| `toEmploymentId` | uuid fk `employments`, unique | Employment B — one transfer per receiving employment |
| `effectiveDate` | date | Employment B's `joinDate`; Employment A's `terminationDate` is `effectiveDate - 1` |
| `groupServiceContinuity` | enum `CONTINUOUS \| RESET` | |
| `continuityReason` | text, nullable | CHECK: required when `RESET` |
| `leaveBenefitTreatmentNote` | text, nullable | free text, feeds final pay manually |
| `allowedOverlap` | boolean, default false | escape hatch for the no-concurrent-employment rule |
| `overlapReason` | text, nullable | CHECK: required when `allowedOverlap` |
| `evidenceRef` | text, nullable | placeholder until `artifacts` exists |
| `finalPayRunId` | text, nullable, fk `pay_runs` | linked later, once that run exists |
| `commencementRunId` | text, nullable, fk `pay_runs` | linked later, once that run exists |
| `actor` | text, not null | |
| `createdAt` | timestamptz | |

No `status` column: with no draft-persisting wizard, every row is already a
completed commit.

### `employment_prior_ytd` (new table)

One row per (receiving employment, calendar year) — the prior employer's
figures needed for PCB tax continuity. Mirrors `pcb_entries`' verified/source
shape, not `ytd_openings` (that table does not exist in this codebase; it is
a stale reference from an earlier design pass).

| Column | Type | Notes |
|---|---|---|
| `employmentId` | uuid fk `employments` | Employment B |
| `calendarYear` | integer | PK is `(employmentId, calendarYear)` |
| `grossSen`, `epfEeSen`, `epfErSen`, `socsoEeSen`, `socsoErSen`, `eisEeSen`, `eisErSen`, `pcbSen`, `zakatSen` | bigint sen | CHECK non-negative |
| `verified` | boolean, default false | |
| `source` | text, nullable | CHECK: required when `verified` |
| `evidenceRef` | text, nullable | |
| `enteredBy`, `enteredAt`, `verifiedBy`, `verifiedAt` | text / timestamptz | |

The prior employer's company identity is never stored here — it is derivable
via `transfers.fromEmploymentId → employments.companyId`, so there is nothing
to duplicate or let drift out of sync.

## Service — `src/service/transfer.ts`

### `commitTransfer(db, input): Promise<{ transferId, toEmploymentId }>`

One transaction, following the `createRun` pattern in `src/service/payrun.ts`:

1. Load Employment A (`input.fromEmploymentId`). Assert it belongs to
   `input.personId` and is open (`terminationDate IS NULL`).
2. Validate, in order, throwing a descriptive error on the first failure:
   - **No concurrent employment.** The person has no other open employment
     unless `input.allowOverlap` and a non-blank `input.overlapReason` are
     both given.
   - **No retroactive close into a locked period.** Employment A's resulting
     `terminationDate` (`effectiveDate - 1`) must not fall inside a period
     covered by an `APPROVED`/`CLOSED` regular run at Company A.
   - **Service dates ordered.** The person's `groupServiceDate` (after this
     commit) must not exceed the new employment's `joinDate`.
3. Update Employment A: `terminationDate = effectiveDate - 1`,
   `terminationReason = 'INTERNAL_GROUP_TRANSFER'`.
4. Insert Employment B: new `employeeCode`/`companyId` from input, `joinDate =
   effectiveDate`, pay basis/rate/applicability flags from input (default to
   Employment A's where the caller omits them), `priorEmploymentId =
   fromEmploymentId`.
5. If `groupServiceContinuity === 'RESET'`, update `persons.groupServiceDate =
   effectiveDate`. If `CONTINUOUS`, leave it untouched.
6. Insert the `transfers` row.
7. Insert one `audit_events` row (`entity: "transfers"`).

These three business rules are validated in the service, not as CHECK
constraints or triggers: two have a legitimate, explicit override, and the
existing trigger convention in this codebase (`docs/architecture/payroll-architecture.md`
§2.7) reserves triggers for exception-less invariants.

### `recordPriorEmploymentYtd(db, input): Promise<void>`

Independent of `commitTransfer` — this data is typically entered after
Company A issues its final payslip, not atomically with the transfer commit.
Upserts one `employment_prior_ytd` row.

## Transfer-finding authority doctrine

A transfer finding that evaluates facts across the source and destination
employments is governed by **both** employment scopes.

Acknowledgement of such a finding requires `EMPLOYMENT UPDATE` authority for
**both** the source company and the destination company. Duplicate company
scopes are evaluated once, so an intra-company transfer requires the permission
a single time.

This governs the two commit-time findings produced by
`collectTransferCommitFindings` — `TRANSFER_OVERLAP_DATES` and
`SERVICE_DATES_INCONSISTENT` — each of which compares Employment A's dates
against Employment B's and therefore belongs to neither company alone.

Run-scoped findings (those carrying `runId`) are **not** covered by this rule.
They remain governed by `PAY_RUN UPDATE` via `acknowledgeRunFinding`, and the
transfer surface must reject them.

Enforced by `acknowledgeTransferFindingForActor` in `src/service/findings.ts`,
exposed as `POST /v1/transfers/findings/:findingId/acknowledge`. The executable
statement of this policy is the source-only and destination-only 403 cases in
`tests/db/transfer-finding-acknowledge.test.ts`.

## What does not change

Run membership already selects by employment-period overlap
(`loadPeriodMembers` in `src/service/payrun.ts`), not an active flag, so
Employment A's final month and Employment B's commencement month are both
picked up correctly with zero engine or run-membership changes.

## Testing

- `tests/db/enums.test.ts` — extend for `termination_reason` membership
  parity (existing pattern).
- `tests/db/transfer.test.ts` (new, real-Postgres harness per
  `tests/db/daily-employment-payrun.test.ts`):
  - Happy path: Employment A ends, Employment B is created, `transfers` row
    is correct, `priorEmploymentId` is set.
  - `groupServiceContinuity`: `RESET` updates `persons.groupServiceDate`;
    `CONTINUOUS` leaves it untouched.
  - Each of the three business-rule rejections, and that the matching
    override (`allowOverlap`) lets the concurrent-employment one through.
  - `employment_prior_ytd`: insert, non-negative CHECK, verified-requires-source
    CHECK.
