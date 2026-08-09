# Findings Assurance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provable assurance that payroll controls observe, preserve, and govern conditions they were designed to catch.

**Architecture:** Risk-weighted A+ — prove control framework and acknowledgement revision binding first; fix detector semantics with failing tests; establish catalog coverage; harden import; only then refactor `detectRunFindings`.

**Tech Stack:** Vitest, Postgres (test harness), Hono services, Drizzle ORM

**Spec:** `docs/superpowers/specs/2026-08-09-code-quality-findings-assurance-design.md`

## Global Constraints

- Correctness before complexity reduction; golden master must stay green
- Exact catalog rule IDs from `PAYRUN_ANOMALY_RULES` / `TRANSFER_ANOMALY_RULES`
- Gate names: `REVIEW` | `APPROVAL` | `RELEASE` | `CLOSE`
- Reuse `isIsoDate` from `domain/date.ts` — no second calendar validator
- Acknowledgement revision binding via Option 2 (no migration)
- NET variance thresholds from catalog constants; `pct` is a ratio

---

## File map

| Area | Create / modify |
|------|-----------------|
| Control framework tests | `tests/findings/scan-contract.test.ts`, expand `tests/db/phase6-gates.test.ts` |
| Release semantics | `tests/findings/payment-readiness.test.ts` |
| Ack revision | `tests/findings/acknowledgement-lifecycle.test.ts`, `src/service/run-findings.ts` |
| Service guard | `src/service/payrun.ts` (`recomputeRun` refuse APPROVED/CLOSED) |
| Detectors | `src/service/run-findings.ts` + `tests/findings/{workforce,statutory,net-pay}.test.ts` |
| Catalog coverage | `tests/findings/catalog-coverage.test.ts` |
| Import | `src/domain/import/employee-row.ts`, `src/service/employee-import.ts`, tests |

---

## Task 1: P0A — Service refuse recompute on APPROVED/CLOSED

**Files:**
- Modify: `src/service/payrun.ts`
- Modify: `tests/db/phase6-gates.test.ts` (or new findings test)

- [ ] **Step 1:** Write failing test — `recomputeRun` on APPROVED throws `ControlError` with `INVALID_STATE` before mutating lines
- [ ] **Step 2:** Run test, confirm fail
- [ ] **Step 3:** Guard at start of `recomputeRun` after load: if status APPROVED/CLOSED → throw
- [ ] **Step 4:** Run test, confirm pass; run `tests/db/phase6-gates.test.ts`
- [ ] **Step 5:** Commit

---

## Task 2: P0A — Gate blocks × severity matrix + RELEASE partial/global

**Files:**
- Create: `tests/findings/scan-contract.test.ts` (successful recompute stamps scan; stale → SCAN_INCOMPLETE)
- Create: `tests/findings/payment-readiness.test.ts`
- Expand gate tests for WARNING/INFO/blocks

- [ ] **Step 1:** Tests for SCAN stamp after successful recompute
- [ ] **Step 2:** Insert OPEN findings with controlled severity/blocks; assert gate outcomes
- [ ] **Step 3:** Two-line APPROVED run: BANK_DETAILS_MISSING on A → preview excludes A, B eligible
- [ ] **Step 4:** Run-scoped RELEASE issue (null lineId) → fail closed entirely
- [ ] **Step 5:** Commit

---

## Task 3: P0B — Revision-bound acknowledgements

**Files:**
- Modify: `src/service/run-findings.ts` (`upsertRunFindings`, `acknowledgeRunFinding`)
- Create: `tests/findings/acknowledgement-lifecycle.test.ts`

- [ ] **Step 1:** Failing test — ACK + same fingerprint + new calcRevision → reopen with `REVISION_CHANGED`
- [ ] **Step 2:** Ack event includes `calcRevision`
- [ ] **Step 3:** Implement reopen path when `prev.detectedRevision !== revision` && ACK && gate-relevant
- [ ] **Step 4:** Same fingerprint OPEN on new revision → update `detectedRevision`
- [ ] **Step 5:** Commit

---

## Task 4: P0C — Four detector semantics

**Files:**
- Modify: `src/service/run-findings.ts` (`detectRunFindings`, baseline helpers)
- Create: `tests/findings/workforce.test.ts`, `statutory.test.ts`, `net-pay.test.ts`

- [ ] **Step 1:** NEW_EMPLOYEE policy — no baseline → no finding; baseline + new hire → finding
- [ ] **Step 2:** STATUTORY_ZERO_WITH_WAGES — scheme-specific wages; legitimate zero → no finding
- [ ] **Step 3:** Baseline only APPROVED/CLOSED REGULAR
- [ ] **Step 4:** EMPLOYEE_OMITTED uses real period applicability
- [ ] **Step 5:** Commit each detector fix separately

---

## Task 5: P0D — Catalog coverage

**Files:**
- Create: `tests/findings/catalog-coverage.test.ts`
- Ensure every `PAYRUN_ANOMALY_RULES` / `TRANSFER_ANOMALY_RULES` ruleId is in tested registry

- [ ] **Step 1:** Coverage test importing live catalogs
- [ ] **Step 2:** Fill missing detector tests until coverage equals catalog
- [ ] **Step 3:** Commit

---

## Task 6: P1 — Import integrity

**Files:**
- Modify: `src/domain/import/employee-row.ts` (reuse `isIsoDate`)
- Modify: `src/service/employee-import.ts` (batch duplicate validation)
- Expand: `tests/domain/employee-row.test.ts`, import tests

- [ ] **Step 1:** Invalid calendar dates rejected via `isIsoDate`
- [ ] **Step 2:** Intra-file duplicate `(company, employeeCode)` fails before persist
- [ ] **Step 3:** Create-only SKIPPED_EXISTING frozen
- [ ] **Step 4:** Commit

---

## Task 7: P2 — Refactor (only after Tasks 1–6 green)

- [ ] Extract detectors one at a time behind existing tests
- [ ] No complexity score target

---

## Verification

```bash
npm test -- tests/findings tests/db/phase6-gates.test.ts tests/domain/employee-row.test.ts
npm test -- tests/golden/july-2026-afenda.test.ts
```
