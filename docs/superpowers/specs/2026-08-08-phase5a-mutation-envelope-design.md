# Phase 5A — Pay-run mutation response envelope

**Date:** 2026-08-08 · **Status:** Frozen · **Scope:** L4 unified mutation snapshot (no line roots, no full workspace UI)

> **Phase 5A establishes the canonical pay-run mutation response contract. It does
> not add per-line derivation presentation, new payroll behavior, or control/gate
> semantics.**

Locks a single JSON envelope for pay-run mutations so L5 never assembles
coherent run state from racing independent GETs after a write.

Companions: [presentation-facade](../../architecture/presentation-facade.md),
[pay-run-http-api](./2026-08-08-pay-run-http-api-design.md),
[phase6-findings-gates-approval](./2026-08-08-phase6-findings-gates-approval-design.md),
[payrun-workspace](./2026-08-08-payrun-workspace-design.md) (frozen cockpit — later).

---

## Invariant

> After a pay-run mutation succeeds, the response alone carries run identity,
> `calcRevision` (and related certifications), findings counters, and gate
> readiness. The facade must not need a follow-up GET to know whether the write
> stuck or what revision is current.

---

## 1. Scope

**In**

- Canonical `PayRunMutationEnvelope` type + `loadPayRunMutationEnvelope(db, runId, mutation)`
- Adopt on: create, recompute, review, approve, demote, findings scan, findings acknowledge
- Prove-out: recompute includes prior `{ computed, failures }` under `mutation`
- Run snapshot only — **no** per-line 19 roots (Phase 5B / drawer)

**Out**

- Full pay-run workspace UI / derivation drawer
- Line-edit / PCB cell-commit endpoints
- Changing `recomputeRun` internal return used by golden/CLI tests
- Payment/release/settle control routes (may adopt the same helper later)

---

## 2. Envelope shape

```ts
type PayRunMutationEnvelope = {
  run: {
    id: string;
    companyId: string;
    status: string;
    calcRevision: string | null;
    findingsScannedRevision: string | null;
    reviewedRevision: string | null;
    approvedRevision: string | null;
    year: number;
    month: number;
  };
  counters: {
    lineCount: number;
    findingsTotal: number;
    findingsOpen: number;
    findingsBlocking: number;
    findingsWarning: number;
    gates: Record<"REVIEW" | "APPROVAL" | "RELEASE" | "CLOSE", {
      ok: boolean;
      issueCount: number;
    }>;
  };
  mutation:
    | { kind: "CREATE"; lineCount: number }
    | { kind: "RECOMPUTE"; computed: number; failures: RecomputeFailure[] }
    | { kind: "REVIEW" }
    | { kind: "APPROVE" }
    | { kind: "DEMOTE" }
    | { kind: "FINDINGS_SCAN"; scanned: number; revision: string | null }
    | { kind: "FINDING_ACKNOWLEDGE"; findingId: string };
};
```

HTTP errors stay `{ code, message }` — envelope is success bodies only.

---

## 3. Compatibility

- Internal `createRun` / `recomputeRun` keep existing return types for tests/CLI.
- HTTP `*ForActor` / routes wrap with the envelope after the write.
- Clients that only read `computed`/`failures` must read `mutation.computed` /
  `mutation.failures` after this slice (breaking change on recompute JSON).

---

## 4. Success criteria

1. Recompute `200` includes `run.calcRevision` (non-null on clean compute) and `mutation.kind === "RECOMPUTE"`.
2. Create `201` includes `run` + `mutation.kind === "CREATE"`.
3. Review/approve/demote return envelope with updated `run.status` / revisions.
4. No per-line sen roots in the envelope.
5. Domain/db API tests cover envelope fields on recompute + create.
