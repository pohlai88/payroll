# Phase 6–7 — Lean control backend (gates, payments, R2, closure)

**Date:** 2026-08-08 · **Status:** Phase 7 backend implemented · **Scope:** payments / R2 / closure HTTP

> **Phase 6 findings/gates/approval** live in
> [phase6-findings-gates-approval-design](./2026-08-08-phase6-findings-gates-approval-design.md).
> This document retains the Phase 7 contract: payments, release batches, R2
> artifacts, distributions, closure manifest, and Hono wiring surface (no SPA).

Ports Plan1 control semantics onto Neon/Hono with Cloudflare R2. No SPA.
Another agent wires UI to the HTTP surface.

Companions: [payrun-workspace-design](./2026-08-08-payrun-workspace-design.md)
(frozen §§1, 4, 6), Plan1 handoff (`SETTLED_WITH_FAILURES`, payments owns
line transitions).

---

## Invariant

> Database owns facts; R2 owns files; hashes bind them; closure seals both.
> `payments` is the sole writer of `line_payments` state. Payment is line-level;
> run status never includes PAID.

---

## 1. Scope

**In**

- Payments / release / settle / reconcile / distribute / close
- R2 artifact store + `artifacts` metadata
- Generic payment register CSV (not a bank upload file)
- Hono Phase 7 routes under `PAY_RUN` CRUD
- Findings/gates/approval owned by the Phase 6 spec (full §4.3 catalog)

**Out**

- SPA / Straits UI
- Payslip PDF generation (Phase 8)
- Validated bank formatter → `BANK_UPLOAD_FILE`
- Cell-commit / derivation drawer (Phase 5)

---

## 2. Findings / gates (Phase 6)

Full §4.3 catalog, scan stamp, review/approve HTTP: see
[phase6-findings-gates-approval-design](./2026-08-08-phase6-findings-gates-approval-design.md).

Phase 7 consumes APPROVED runs with READY `line_payments`. RELEASE/CLOSE
prerequisites and the mechanical closure checklist live in services below.

---

## 3. Line payment machine

```
READY ⇄ HOLD
READY → RELEASED → PAID → RECONCILED
RELEASED → FAILED_RETURNED → (re-release)
READY/HOLD → WITHDRAWN
RELEASED → WITHDRAWN only via cancel-before-settle
PAID ✕→ WITHDRAWN
```

Batch statuses: `OPEN | SETTLED | PARTIALLY_SETTLED | SETTLED_WITH_FAILURES | CANCELLED`.
`SETTLED_WITH_FAILURES` is terminal (failed-then-retried must still close).

---

## 4. R2

Env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`,
`R2_ENDPOINT`. Object keys: `runs/{runId}/{artifactId}/{filename}`.

Tests inject an in-memory `ArtifactStore`; CI never hits live R2.

---

## 5. HTTP surface (summary)

Auth Bearer + `requirePermission(PAY_RUN, …)`:

- Review / approve / demote / close
- Findings list / scan / acknowledge
- Hold / unhold / withdraw
- Release preview / commit / settle / cancel
- Artifact attach / list / signed download URL
- Distribution record
- Payment rollup + closure checklist reads

---

## 6. Closure

`closeRun` requires every included line RECONCILED or WITHDRAWN; every
PAID/RECONCILED line has a distribution; every batch terminal; no PENDING
attempts; CLOSE gate clear; then writes `manifest.json` to R2, stores
`closed_manifest_artifact_id`, sets CLOSED.
