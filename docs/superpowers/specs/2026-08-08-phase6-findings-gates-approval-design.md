# Phase 6 — Findings, gates, approval

**Date:** 2026-08-08 · **Status:** Implemented (API/service) · **Scope:** DB + services + Hono only

Server control layer that makes `DRAFT → REVIEWED → APPROVED` real and creates
the payment-obligation projection (`line_payments` READY). No SPA.

Companions: [payrun-workspace-design](./2026-08-08-payrun-workspace-design.md)
(frozen §§1, 4, 6.1). Supersedes Phase 6 scope in
[phase6-7-control-backend-design](./2026-08-08-phase6-7-control-backend-design.md)
(that doc mixed Phase 7 and a lean 4-rule catalog).

---

## Invariant

> A gate evaluator may explain whether a transition is permitted; only the
> transition service may change run state. Evaluation has no side effects.
>
> Finding identity is stable `(runId, lineId?, ruleId)`; fingerprint versions
> evidence. Fingerprint change invalidates acknowledgement and does not create
> a second logical finding.
>
> `findingsScannedRevision` must equal `calcRevision` before REVIEW/APPROVAL.
> A failed scan never advances that stamp.
>
> APPROVAL creates the payment obligation projection (`line_payments` READY) —
> it does not start payment processing.

---

## 1. Scope

**In**

- `calcRevision` certification on recompute
- Full workspace §4.3 catalog (15 rules) + acknowledgement lifecycle
- Pure `evaluateGate(REVIEW | APPROVAL | RELEASE | CLOSE)`
- `DRAFT → REVIEWED` and `REVIEWED → APPROVED` (revision-bound)
- Atomic APPROVED + `line_payments` READY (idempotent on `line_id`)
- Hono `/v1/pay-runs/...` under `PAY_RUN` CRUD
- Findings freeze after APPROVED (mutations → `409 INVALID_STATE`)

**Out**

- RELEASE / CLOSE transitions
- Hold / withdraw / settle / reconcile / batches / attempts
- Artifacts / R2 closure machinery beyond existing evidence tables
- Payroll UI / derivation drawer
- Transfer §8.6 findings (column may remain; rules deferred)
- Statutory calculation engine changes

---

## 2. Schema

| Piece | Role |
|---|---|
| `pay_runs.calc_revision` | Hash of calc-relevant state |
| `pay_runs.findings_scanned_revision` | Last fully successful scan revision |
| `pay_runs.reviewed_*` / `approved_*` | Certification stamps |
| `anomaly_findings` + `finding_events` | Stable identity + evidence history |
| `gate_certifications` | `UNIQUE(runId, gate, calcRevision)` — Phase 6 writes REVIEW + APPROVAL |
| `line_payments` | `UNIQUE(line_id)` — READY at approve |

Finding uniqueness:

```text
UNIQUE (run_id, line_id, rule_id) WHERE line_id IS NOT NULL
UNIQUE (run_id, rule_id) WHERE line_id IS NULL AND run_id IS NOT NULL
```

---

## 3. HTTP

Bearer + `requirePermission(PAY_RUN, …)`:

| Method | Path | Perm |
|---|---|---|
| `POST` | `/v1/pay-runs/:id/recompute` | UPDATE |
| `GET` | `/v1/pay-runs/:id/findings` | READ |
| `POST` | `/v1/pay-runs/:id/findings/scan` | UPDATE |
| `POST` | `/v1/pay-runs/:id/findings/:findingId/acknowledge` | UPDATE |
| `POST` | `/v1/pay-runs/:id/gates/:gate/evaluate` | READ |
| `POST` | `/v1/pay-runs/:id/review` | UPDATE — body `{ calcRevision }` |
| `POST` | `/v1/pay-runs/:id/approve` | UPDATE — body `{ calcRevision }` |

Review/approve acceptance:

```text
body.calcRevision == payRun.calcRevision == findingsScannedRevision
```

Approve additionally: `reviewedRevision == calcRevision`.

Errors: `STALE_REVISION`, `SCAN_INCOMPLETE`, `GATE_BLOCKED`, `INVALID_STATE`,
plus existing auth errors.

---

## 4. Concurrency

`recompute`, `scan`, `acknowledge`, `review`, `approve` take
`SELECT … FOR UPDATE` on the pay run. Approval verifies status, revisions, scan
completeness, and APPROVAL gate under that lock, then certifies + READY rows
in one transaction.

---

## 5. Verification

- Domain: catalog constants, fingerprint reopen semantics (unit)
- DB: uniqueness, stamp completeness, stale review, approve atomicity/idempotency,
  frozen mutation 409, pure RELEASE/CLOSE evaluate
- Golden master untouched
