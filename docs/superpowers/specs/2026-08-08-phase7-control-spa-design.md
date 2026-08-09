# Phase 7 — Control SPA (payments, release, closure, artifacts)

**Date:** 2026-08-08 · **Status:** Approved for planning · **Scope:** SPA wire-up only, no new server routes

Wires the existing Phase 7 backend (payments / release / settle / reconcile /
distribute / close / R2 artifacts — [phase6-7-control-backend-design](./2026-08-08-phase6-7-control-backend-design.md))
into the workspace SPA, completing the pay-run lifecycle from APPROVED through
CLOSED. Same doctrine as [Phase 5C](./2026-08-08-phase6-findings-gates-approval-design.md):
the browser never invents payment states, never bypasses the closure
checklist, and never performs optimistic mutations.

---

## Invariant

> `payments` remains the sole writer of `line_payments` state — the SPA
> renders server state and collects intent; it never assigns a state itself.
> Run status never includes PAID; payment is line-level.
>
> RELEASE and CLOSE gates are read-only checks. Close only succeeds through
> the server's mechanical checklist (`closureChecklist`) — the SPA shows that
> checklist verbatim and never derives its own close eligibility beyond the
> soft `actionAvailability.canClose` hint used for button visibility.
>
> No optimistic mutations: every payment/release/close action calls the
> server, waits for the response, then refetches the workspace.

---

## 1. Scope

**In**

- Payments panel on the workspace (APPROVED/CLOSED runs): list `LinePaymentState`
  per line, Hold (with reason), Unhold, Withdraw (reason code + note)
- Release panel: select READY/FAILED_RETURNED lines → preview (byBank
  breakdown, excluded reasons, totals) → commit (BANK/CASH) → opens the batch
- Batch drawer: per-attempt Settle (PAID/FAILED + optional ref), Reconcile
  (+ optional evidence artifact), Cancel batch (OPEN only)
- Distribution recording (channel + optional artifact/note) so RECONCILED
  lines can satisfy the closure checklist
- Closure checklist dialog: fetch `GET …/closure-checklist`, render the 5
  items, confirm enabled only when all `ok`, then `POST …/close`
- Artifacts panel: list run artifacts (register CSV, manifest, manual
  uploads), manual upload, signed download URL
- Run header: Close button gated by `actionAvailability.canClose`
- Employee grid: optional `paymentState` column (neutral badge, not
  status-ok/bad — payment state is not success/failure)
- Control page: RELEASE gate pill for APPROVED runs (alongside existing
  REVIEW/APPROVAL pills), action label becomes context-appropriate

**Out**

- Payslip PDF / bilingual payslip generation (Phase 8)
- Bank-file upload formatter (`BANK_UPLOAD_FILE`) — only the generic register
  CSV the server already produces
- Any new server routes, service functions, or domain rules
- Client-side derivation of payment-state legality (server `assertTransition`
  stays authoritative)
- Optimistic UI updates for any payment/release/close action

---

## 2. Architecture

```mermaid
flowchart TD
    subgraph workspace [Pay-run workspace, status APPROVED/CLOSED]
        RunHeader["RunHeader\n(+ Close button)"]
        PaymentsPanel["PaymentsPanel\n(list, hold/unhold, withdraw)"]
        ReleasePanel["ReleasePanel\n(select READY lines, preview, commit)"]
        BatchDrawer["BatchDrawer\n(attempts: settle, reconcile, cancel)"]
        ArtifactsPanel["ArtifactsPanel\n(list, upload, signed download)"]
        ClosureDialog["ClosureChecklistDialog\n(5-item checklist, confirm close)"]
    end
    subgraph control [/control screen]
        RunControlCard["RunControlCard\n(+ RELEASE gate pill)"]
    end
    subgraph api [Hono API \u2014 already built, no changes]
        EP1["GET /pay-runs/:id/payments"]
        EP2["POST /pay-runs/:id/lines/:lid/hold|unhold|withdraw"]
        EP3["POST /pay-runs/:id/release/preview"]
        EP4["POST /pay-runs/:id/release"]
        EP5["GET /pay-runs/:id/batches/:bid"]
        EP6["POST /pay-runs/:id/attempts/:aid/settle|reconcile"]
        EP7["POST /pay-runs/:id/batches/:bid/cancel"]
        EP8["POST /pay-runs/:id/lines/:lid/distributions"]
        EP9["GET/POST /pay-runs/:id/artifacts"]
        EP10["GET /pay-runs/:id/closure-checklist"]
        EP11["POST /pay-runs/:id/close"]
    end

    RunHeader -->|"canClose"| ClosureDialog
    ClosureDialog --> EP10
    ClosureDialog --> EP11
    PaymentsPanel --> EP1
    PaymentsPanel --> EP2
    PaymentsPanel -->|"select lines"| ReleasePanel
    ReleasePanel --> EP3
    ReleasePanel --> EP4
    ReleasePanel -->|"commit"| BatchDrawer
    BatchDrawer --> EP5
    BatchDrawer --> EP6
    BatchDrawer --> EP7
    BatchDrawer -->|"settle PAID"| PaymentsPanel
    PaymentsPanel -->|"reconcile + distribute"| EP8
    ArtifactsPanel --> EP9
    RunControlCard --> EP10
```

---

## 3. New files

| File | Responsibility |
|------|-----------------|
| `src/web/payrun/payments-panel.tsx` | Payment state table + hold/unhold/withdraw row actions + line selection for release |
| `src/web/payrun/release-panel.tsx` | Preview/commit release for selected lines |
| `src/web/payrun/batch-drawer.tsx` | Sheet: one batch's attempts, settle/reconcile/cancel |
| `src/web/payrun/closure-checklist-dialog.tsx` | Checklist fetch + render + confirm close |
| `src/web/payrun/artifacts-panel.tsx` | List + upload + signed download |

## 4. Changed files

- [`src/web/payrun/workspace.tsx`](../../../src/web/payrun/workspace.tsx) — render `PaymentsPanel` + `ArtifactsPanel` when `run.status` is APPROVED/CLOSED; own release/batch/closure dialog state
- [`src/web/payrun/run-header.tsx`](../../../src/web/payrun/run-header.tsx) — add Close button gated by `actionAvailability.canClose`, opens `ClosureChecklistDialog`
- [`src/web/payrun/employee-grid.tsx`](../../../src/web/payrun/employee-grid.tsx) — optional `payments` prop; when present, render a `paymentState` badge column
- [`src/web/control/control-page.tsx`](../../../src/web/control/control-page.tsx) — extend `gateForStatus` to return `"RELEASE"` for APPROVED; card action label reflects release/close readiness
- [`src/web/control/run-control-card.tsx`](../../../src/web/control/run-control-card.tsx) — no interface change; existing `GatePill` already covers CLEAR/BLOCKED/UNKNOWN/N-A
- [`src/web/api/client.ts`](../../../src/web/api/client.ts) — add methods for all 14 Phase 7 routes listed in §1
- [`src/web/api/types.ts`](../../../src/web/api/types.ts) — add `LinePaymentRow`, `LinePaymentState`, `ReleasePreview`, `Batch`/`PaymentAttempt`, `ChecklistItem`, `ArtifactRow` DTOs mirroring the server shapes in `src/service/{payments,release,close,artifacts}.ts` exactly
- [`src/web/api/payroll-api.ts`](../../../src/web/api/payroll-api.ts) — re-export new types + convenience methods

## 5. Key design decisions

**Payments panel** shows one row per pay line: employee identity (reuse grid's sticky-column pattern), `LinePaymentState` badge (neutral styling — READY/HOLD/RELEASED/PAID/FAILED_RETURNED/RECONCILED/WITHDRAWN are process states, not success/failure), `netSen` via `MoneyCell`, and a row action menu. Row actions are gated by the line's current state, mirroring the server's `PAY_TRANSITIONS` map exactly (`src/service/payments.ts`): Hold and Withdraw appear on READY rows; Unhold and Withdraw appear on HOLD rows; Withdraw also appears on FAILED_RETURNED rows (its only other legal exit besides re-release); no actions render on RELEASED/PAID/RECONCILED/WITHDRAWN rows (those move only through the release/batch flow or are terminal). A checkbox column (enabled only for READY/FAILED_RETURNED rows) feeds the release panel's selection. When `run.status === "CLOSED"`, the entire panel renders read-only — no checkboxes, no row action menu — since every line is necessarily RECONCILED or WITHDRAWN by then.

**Release panel** is a bar that appears above the payments table once ≥1 line is checked. "Preview" calls `POST .../release/preview` and renders eligible/excluded/byBank/totals in a dialog; excluded reasons are shown verbatim from the server (bank details missing, gate blocked, wrong state) — the SPA does not re-derive why a line is excluded. "Commit" (method toggle BANK/CASH) calls `POST .../release`, then opens the resulting batch in `BatchDrawer`.

**Batch drawer** is a `Sheet` (matching the employee slide-over pattern) showing `GET .../batches/:id` — batch status and its attempts. Each PENDING attempt gets Settle (outcome PAID/FAILED, optional paymentRef/failedReason) and, once PAID, Reconcile (optional evidence artifact picker sourced from `ArtifactsPanel`'s list). An OPEN batch gets a Cancel action (reason required) that returns its lines to READY.

**Distribution recording** is a small inline action on RECONCILED payment rows: pick a channel (GENERATED/SENT/DELIVERED/HANDED/PRINTED), optional artifact + note, `POST .../distributions`. This is what lets the closure checklist's `distributions` item pass.

**Closure checklist dialog** mirrors `GateCheckDialog`'s shape exactly: fetch on open, render each `ChecklistItem` (`item`, `ok`, `detail`) as a pass/fail row, Confirm enabled only when every item is `ok`, `POST .../close` on confirm, then refetch workspace. No client checklist logic is duplicated — the dialog is a pure renderer of the server's checklist.

**Artifacts panel** lists `GET .../artifacts` (register CSV from release, manifest from close, any manual uploads), each row has a "Get link" action calling `GET .../artifacts/:id/url` and opening it, plus a manual upload button (`POST .../artifacts` with base64 — reuse the existing `UploadDropZone` primitive from Phase 4C).

**Neutral styling carried from 5B/5C**: `LinePaymentState` badges use `outline`/`secondary` variants, never `status-ok`/`status-bad` — a HOLD is not bad, a PAID is not automatically good (it still needs reconciliation). `GatePill` reuses the existing CLEAR/BLOCKED/UNKNOWN/N-A vocabulary from 5C.

## 6. Constraints carried from Phase 5B/5C

- `actionAvailability` (including `canClose`) gates button visibility — never re-derived from `run.status` client-side
- No arithmetic beyond rendering server-supplied `netSen`/`totalSen` through `MoneyCell`
- No optimistic mutations anywhere in this surface
- Server DTOs (`LinePaymentState`, `ChecklistItem`, etc.) are mirrored exactly in `src/web/api/types.ts`, not reinvented
