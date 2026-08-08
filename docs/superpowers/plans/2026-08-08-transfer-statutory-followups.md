# Transfer / Statutory Follow-ups Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans or subagent-driven-development. Steps use checkbox syntax.

**Goal:** Ship entity-scoped evidence artifacts, six §8.6 transfer findings, S06 wage treatments, and PCB remuneration taxonomy.

**Architecture:** Neon/Postgres schema + service/domain layers; no UI; local `data/artifacts/` storage.

**Tech Stack:** Drizzle, pg, Vitest, existing transfer/payrun services.

## Global Constraints

- Money remains integer sen; golden master sen-identical.
- Domain calc stays free of DB imports.
- Evidence only via `storeAttachedEvidence`.
- Do not implement full findings catalog or R2 in this slice.

---

### Task 1: Design spec

- [x] Spec at `docs/superpowers/specs/2026-08-08-transfer-statutory-followups-design.md`

### Task 2: Phase 1 artifacts

- [x] Schema + migration 0016
- [x] `storeAttachedEvidence` / `requireArtifact` on artifacts service
- [x] Wire transfer + prior YTD
- [x] Tests

### Task 3: Phase 2 findings

- [x] Schema + migration 0017
- [x] Findings service + transfer detectors
- [x] Hooks + tests (incl. `scanRunFindings` wiring)

### Task 4: Phase 3a S06 treatments

- [x] Schema + migration 0018 + cutover
- [x] Mirror sync trigger; `hrdWages` in engine
- [x] Golden parity (domain suite green)

### Task 5: Phase 3b PCB class

- [x] Schema + migration 0019 + cutover
- [x] Replace BONUS hard-code as sole authority
- [x] Domain + db tests

### Task 6: Docs closeout

- [x] S06 amendment, architecture, README, transfer design

### Stabilization (post-ship quality pass)

- [x] `loadPayItems` applies EPF/SOCSO/EIS/HRD from treatments
- [x] `pcb_class_snap` from `pay_item_pcb_classes` (not BONUS hardcode)
- [x] `recordWageTreatmentDeparture` / `recordPcbClassDeparture` (actor ≠ approver)
- [x] `LocalFsArtifactStore` default; wrong-entityType reject test
- [x] `scanRunTransferFindings` wired into `scanRunFindings`
- [x] Transfer finding clear/resolve on re-scan
