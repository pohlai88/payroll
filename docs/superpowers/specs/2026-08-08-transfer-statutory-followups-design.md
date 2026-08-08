# Transfer / Statutory Follow-ups — Design

**Date:** 2026-08-08 · **Status:** Implementing · **Slice:** transfer findings §8.6 + artifacts + S06/PCB taxonomy

## Frozen sentences

1. **Evidence** enters only through the app as hashed `artifacts` rows; transfer letters and prior-YTD payslips attach by `evidenceArtifactId`, not free-text paths.
2. **§8.6 transfer findings** persist in a minimal findings engine (six rule ids only); domain-impossible transfer cases stay hard rejects in `commitTransfer`.
3. **Pay-item statutory treatment** is effective-dated and audited for EPF, SOCSO, EIS, and HRD; PCB uses a separate governed `pcb_remuneration_class` (`NORMAL` | `ADDITIONAL` | `EXCLUDED`) after S07 compute landed.

## Phase 1 — Artifacts

- Table `artifacts` with nullable `runId`, `entityType` ∈ {TRANSFER, EMPLOYMENT_PRIOR_YTD, PAY_RUN, OTHER}, optional `entityId`, `type` (EVIDENCE for this slice), sha256, relativePath under `data/artifacts/`.
- `transfers.evidence_artifact_id` and `employment_prior_ytd.evidence_artifact_id` FK → `artifacts.id`; keep `evidence_ref` deprecated.
- Service: `storeAttachedEvidence` — only ATTACHED path in this slice.

## Phase 2 — Findings + §8.6

- Tables `anomaly_findings`, `finding_events`.
- Transfer-commit findings: `runId` null, `transferId` set. Run-time findings: `runId` required.
- Rules: `TRANSFER_OVERLAP_DATES`, `PERSON_IN_BOTH_EMPLOYERS`, `TRANSFER_FINAL_PAY_MISSING`, `TRANSFER_PRIOR_TAX_MISSING`, `SERVICE_DATES_INCONSISTENT`, `RECEIVING_REGISTRATION_INVALID`.
- Soft `assertApprovalAllowed(runId)` for APPROVAL-blocking OPEN findings; full gate machine deferred.

## Phase 3 — S06 + PCB taxonomy

### 3a Wage treatments

- `pay_item_treatments` for schemes EPF | SOCSO | EIS | HRD; cutover from boolean columns; HRD defaults from `epf_wages`.
- Booleans remain deprecated mirrors (trigger-synced). Engine `PayItemDef` gains `hrdWages`; HRDF levy uses `hrdWagesSen`.

### 3b PCB remuneration class

- `pay_item_pcb_classes` with `NORMAL` | `ADDITIONAL` | `EXCLUDED`; cutover: BONUS→ADDITIONAL, other EARNING→NORMAL, DEDUCTION→EXCLUDED.
- `pay_line_items.pcb_class_snap`; `splitRemunerationSen` reads class (retire hard-coded BONUS set as sole authority).
- Amends MY-STAT-S06: PCB boolean scheme still out; PCB *class* in post-S07.

## Out of scope

Full §4.3 catalog, RELEASE/CLOSE, R2, transfer wizard UI, CSV allowance→pay_item mapping, IRBM filing pack.
