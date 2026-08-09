# Code Quality: Findings Assurance and Input Integrity

**Date**: 2026-08-09  
**Status**: Design  
**Priority**: P0 (Governance Correctness)

## Objective

**Provable assurance that a payroll cannot progress because an intended control failed to observe, preserve, or correctly govern a condition it was designed to catch.**

Not: "zero lint warnings"  
Not: "reduce all complexity scores"  
Not: "100% test count as goal"

This is about **trustworthiness**:
1. Trustworthy input (reject invalid payroll data)
2. Trustworthy detection (findings catch what they claim to catch)
3. Trustworthy governance (acknowledged findings stay bound to verified revision)
4. Trustworthy calculation (preserve golden master correctness)
5. Then maintainability/performance/cosmetic cleanup

## Current State

### Strengths
- Golden master test: 37 real employees, statutory figures to the sen
- Findings infrastructure exists: detection, persistence, gates, acknowledgement
- Import validation: create-only, row-level failures, basic type checking
- Derivation coverage: 703 assertions across employee population

### Identified Gaps

**P0 - Findings Detection**:
1. `NEW_EMPLOYEE`: Skip logic may miss genuinely new employee when baseline exists
2. `STATUTORY_ZERO_WITH_WAGES`: Uses `baseRateSen` proxy instead of scheme-specific wage bases
3. Prior-run baseline: May include DRAFT/REVIEWED runs inappropriately
4. `EMPLOYEE_OMITTED`: Hardcoded `activeInPeriod = true` ignores actual termination dates
5. **Acknowledgement binding**: Currently evidence-bound, not revision-bound
6. **Gate logic**: Must test `blocks` array × severity × status, not just severity

**P1 - Import Validation**:
- Date validation: Regex-only, accepts `2026-02-31`, `2026-13-01`
- Duplicate codes within file: Order-dependent behavior
- Re-import semantics: Not explicitly defined

**P2 - Complexity**:
- `detectRunFindings`: 114 complexity, single 650-line function
- Calculation engine: High complexity but golden-master protected

## Architecture Principles

1. **Findings are a lifecycle system**: detect → evidence → persist → acknowledge → rescan → gate → certify → freeze
2. **Control framework > individual detectors**: Prove machinery before detectors
3. **Evidence correctness = detection correctness**: Payload must be authoritative
4. **Respect architectural boundaries**: Pay-run vs transfer findings are separate domains
5. **Complexity debt acceptable > unproven extraction**: Don't refactor stable, well-tested code
6. **Golden master is oracle**: Not motivation for refactoring

## Non-Goals

- Reduce all complexity scores to <20
- Achieve "zero lint warnings"  
- Refactor well-tested stable code for aesthetic reasons
- Add tests merely to increase coverage percentage
- Change calculation engine without statutory business need
- Uniform urgency (all detectors equally important)

---

## Phase 0A: Control Framework Verification (Week 1, P0)

**Prove the machinery that makes findings consequential.**

### 0A.1 Scan-Revision Binding

**Contract**:
- `scanRunFindings()` writes `findingsScannedRevision = calcRevision`
- Recompute invalidates prior scan authority
- Stale scan prevents progression through gates

**Test**: `tests/findings/scan-contract.test.ts`

```ts
describe("scan-revision binding", () => {
  it("stamps findingsScannedRevision equal to calcRevision after scan", async () => {
    // Create run, recompute
    // Scan findings
    // Assert: run.findingsScannedRevision === run.calcRevision
  });

  it("recompute invalidates prior scan", async () => {
    // Scan findings (revision R1)
    // Recompute (revision R2)
    // Assert: findingsScannedRevision !== calcRevision
  });

  it("stale scan prevents gate evaluation", async () => {
    // Stale scan
    // Evaluate gate
    // Assert: Gate fails with "findings not scanned for current revision"
  });
});
```

### 0A.2 Gate Behavior

**Contract**:

Gate behavior is governed by:
- OPEN finding
- AND `finding.blocks` includes target gate
- AND severity is not INFO

**Severity semantics**:
- `BLOCKING`: Cannot be acknowledged; underlying condition must be corrected
- `WARNING`: Blocks its configured gate while OPEN; acknowledgement requires a note
- `REVIEW`: Blocks its configured gate while OPEN; acknowledgement clears the gate requirement according to policy
- `INFO`: Never blocks a gate

**Test**: Expand `tests/db/phase6-gates.test.ts`

```ts
describe("gate behavior", () => {
  it("BLOCKING finding in blocks array prevents gate", async () => {
    // Create BLOCKING finding with blocks: ["REVIEW"]
    // Evaluate REVIEW gate
    // Assert: Gate fails
  });

  it("WARNING finding not in blocks array does not prevent gate", async () => {
    // Create WARNING finding with blocks: ["APPROVE"]
    // Evaluate REVIEW gate (not in blocks)
    // Assert: Gate passes
  });

  it("INFO finding never prevents gate regardless of blocks", async () => {
    // Create INFO finding with blocks: ["REVIEW"]
    // Evaluate REVIEW gate
    // Assert: Gate passes
  });

  it("acknowledging WARNING clears gate requirement", async () => {
    // Create WARNING finding blocking REVIEW
    // Acknowledge with note
    // Evaluate REVIEW gate
    // Assert: Gate passes
  });
});
```

### 0A.3 Approval/Closure Immutability

**Contract**:
- DRAFT → recomputable
- REVIEWED → recompute demotes to DRAFT and invalidates review authority
- APPROVED/CLOSED → immutable; recomputation is refused
- Corrections use governed correction/off-cycle mechanism

**Test**: Extend `tests/db/phase6-gates.test.ts`

```ts
describe("approval immutability", () => {
  it("APPROVED run cannot be recomputed", async () => {
    // Approve run
    // Attempt recompute
    // Assert: Recompute rejected
  });

  it("APPROVED findings are frozen", async () => {
    // Approve run with findings
    // Attempt to acknowledge or modify finding
    // Assert: Modification rejected
  });

  it("REVIEWED recomputation demotes to DRAFT", async () => {
    // Review run
    // Recompute
    // Assert: Status = DRAFT, review authority invalidated
  });
});
```

### 0A.4 Release Controls

**Contract**:
- Payment-readiness findings block release, not just approval

**Test**: `tests/findings/payment-readiness.test.ts`

```ts
describe("release controls", () => {
  it("BANK_MISSING blocks release for affected lines", async () => {
    // Create line with missing bank details
    // Detect BANK_MISSING finding
    // Attempt release
    // Assert: Release preview excludes line or blocks
  });
});
```

---

## Phase 0B: Acknowledgement Revision Semantics (Week 1, P0)

**Design Decision Required**: The current implementation appears evidence-bound (fingerprint-based reopening). The stronger invariant is revision-bound.

**Recommended Policy**:

> A non-INFO acknowledgement is certification of a finding at one calculation revision. A new calculation revision must require fresh acknowledgement for any finding that remains gate-relevant, even when its evidence fingerprint happens to remain identical.

**Implementation Options**:

1. **Add `ackRevision` to findings table**
   - Store revision at acknowledgement time
   - Reopen if `calcRevision !== ackRevision` during rescan

2. **Reopen all acknowledged findings on new revision**
   - During scan, reopen gate-relevant acknowledged findings if revision changed
   - Keep fingerprint for evidence-change detection

**Retain fingerprints** - they answer a different question: *did the underlying evidence change?*

**Test**: `tests/findings/acknowledgement-lifecycle.test.ts`

```ts
describe("acknowledgement revision binding", () => {
  it("acknowledgement binds to specific calcRevision", async () => {
    // Scan at revision R1
    // Acknowledge finding
    // Assert: ackRevision = R1 (or equivalent state)
  });

  it("new calcRevision reopens acknowledged finding even with identical evidence", async () => {
    // Scan at R1, acknowledge
    // Recompute → R2 (evidence fingerprint unchanged)
    // Rescan
    // Assert: Finding reopened (status = OPEN)
  });

  it("evidence change reopens acknowledged finding", async () => {
    // Scan, acknowledge
    // Change underlying data (new evidence fingerprint)
    // Rescan
    // Assert: Finding reopened
  });
});
```

---

## Phase 0C: Suspicious Detector Remediation (Week 1-2, P0)

**Fix the four identified detector gaps immediately.**

### 0C.1 `NEW_EMPLOYEE` Detection Logic

**Current issue**: Employee absent from baseline may skip detection

**Test**: `tests/findings/workforce.test.ts`

```ts
describe("NEW_EMPLOYEE", () => {
  it("detects employee joining after prior monthly payroll exists", async () => {
    // Setup: Prior regular APPROVED run with baseline employees
    // Create new run with additional employee (not in baseline)
    // Scan findings
    // Assert: NEW_EMPLOYEE finding exists
  });

  it("does not detect NEW_EMPLOYEE when no prior baseline exists", async () => {
    // First-ever payroll run
    // Scan findings
    // Assert: No NEW_EMPLOYEE findings (all employees are legitimately new)
  });
});
```

**Action**: Fix skip logic to correctly detect genuinely new employees.

### 0C.2 `STATUTORY_ZERO_WITH_WAGES` - Scheme-Specific Bases

**Current issue**: Uses `baseRateSen` proxy instead of scheme-specific wage bases

**Corrected logic**:

```ts
// EPF
if (epfApplicable && epfWagesSen > 0 && epfEeSen === 0) {
  // Detect: EPF contribution expected but zero
}

// SOCSO
if (socsoApplicable && socsoWagesSen > 0 && socsoEeCoreSen === 0) {
  // Detect: SOCSO contribution expected but zero
  // Note: Some categories may have legitimate zero employee contribution
}

// EIS
if (eisApplicable && eisWagesSen > 0 && eisEeSen === 0) {
  // Detect: EIS contribution expected but zero
}
```

**Test**: `tests/findings/statutory.test.ts`

```ts
describe("STATUTORY_ZERO_WITH_WAGES", () => {
  it("detects zero EPF with contributable EPF wages", async () => {
    // Employee: epfWagesSen > 0, epfApplicable = true, epfEeSen = 0
    // Scan findings
    // Assert: STATUTORY_ZERO_WITH_WAGES finding for EPF
  });

  it("detects zero contribution with variable-only earnings (no basic)", async () => {
    // Employee: baseRateSen = 0, overtime wages present
    // epfWagesSen > 0, epfEeSen = 0
    // Assert: Finding detected (variable earnings are contributable)
  });

  it("does not detect when zero contribution is legitimate for category", async () => {
    // Employee: Legitimate statutory zero category
    // Assert: No false positive
  });
});
```

**Action**: Reuse authoritative eligibility/category facts or engine outputs. Do not reimplement contribution tables.

### 0C.3 Prior-Run Baseline Status Eligibility

**Current issue**: May include DRAFT/REVIEWED runs in variance baseline

**Test**: `tests/findings/net-pay.test.ts`

```ts
describe("NET_VARIANCE_VS_PRIOR baseline", () => {
  it("uses only APPROVED/CLOSED runs for variance baseline", async () => {
    // Create DRAFT prior run with different net
    // Create APPROVED prior run with baseline net
    // Create current run
    // Scan findings
    // Assert: Variance calculated against APPROVED run, not DRAFT
  });

  it("uses most recent eligible baseline", async () => {
    // Create multiple APPROVED runs
    // Assert: Most recent APPROVED used as baseline
  });
});
```

**Action**: Add explicit status filter to baseline selection query.

### 0C.4 `EMPLOYEE_OMITTED` Applicability

**Current issue**: Hardcoded `activeInPeriod = true` ignores actual termination dates

**Test**: `tests/findings/workforce.test.ts`

```ts
describe("EMPLOYEE_OMITTED", () => {
  it("does not flag terminated employees as omitted", async () => {
    // Employee: Terminated before period start
    // Not in current run
    // Scan findings
    // Assert: No EMPLOYEE_OMITTED finding
  });

  it("does flag active employees missing from run", async () => {
    // Employee: Active during period (joinDate ≤ periodEnd, no termination)
    // Not in current run
    // Scan findings
    // Assert: EMPLOYEE_OMITTED finding exists
  });

  it("includes employees terminating mid-period", async () => {
    // Employee: Termination date within period
    // Not in run
    // Assert: EMPLOYEE_OMITTED (should appear in final run)
  });
});
```

**Action**: Compute actual period applicability based on `joinDate` and `terminationDate`.

---

## Phase 0D: Catalog-Complete Detection Assurance (Week 2-3, P0)

**Build systematic coverage for all finding types.**

### 0D.1 Test File Architecture

```
tests/findings/
  scan-contract.test.ts              # Phase 0A
  acknowledgement-lifecycle.test.ts  # Phase 0B
  net-pay.test.ts                    # NET_NEGATIVE, NET_ZERO, NET_VARIANCE, NEW_EMPLOYEE
  statutory.test.ts                  # PCB_UNVERIFIED, STATUTORY_ZERO, STEP_SHIFT, EIS_AGE_HISTORY
  workforce.test.ts                  # EMPLOYEE_OMITTED, OVERLAPPING_RUNS
  payment-readiness.test.ts          # BANK_MISSING, BANK_CHANGED
  anomaly.test.ts                    # OT_OUTLIER, VARIABLE_ITEM_SPIKE
  transfer.test.ts                   # Transfer-specific findings
  catalog-coverage.test.ts           # Coverage enforcement
```

### 0D.2 Detection Matrix Per Finding

Each finding type must test:

1. **Positive detection**: Condition present → finding emitted with correct rule ID
2. **Negative detection**: Condition absent → no finding
3. **Boundary cases**: Thresholds, edge values
4. **Evidence correctness**: Payload contains authoritative data (amounts, IDs, baselines)
5. **Rescan transitions**: OPEN → ACKNOWLEDGED → RESOLVED → REOPENED

**Example: NET_VARIANCE_VS_PRIOR**

```ts
describe("NET_VARIANCE_VS_PRIOR", () => {
  it("detects variance exceeding both absolute and percentage thresholds", async () => {
    // Baseline: netSen = 500000 (RM 5,000.00)
    // Current: netSen = 750000 (RM 7,500.00)
    // Variance: abs = 250000 (RM 2,500), pct = 50%
    // Thresholds: abs = 200000 (RM 2,000), pct = 40%
    
    const finding = await detectAndGetFinding("NET_VARIANCE_VS_PRIOR");
    
    expect(finding).toBeDefined();
    expect(finding.evidence).toEqual({
      netSen: 750000,
      baselineNetSen: 500000,
      baselineRunId: expect.any(String),
      absVarianceSen: 250000,
      pct: 50,
    });
  });

  it("does not detect when absolute threshold met but percentage threshold not met", async () => {
    // Baseline: netSen = 10000000 (RM 100,000)
    // Current: netSen = 10250000 (RM 102,500)
    // Variance: abs = 250000 (RM 2,500), pct = 2.5%
    // Thresholds: abs = 200000, pct = 40%
    // Assert: No finding (percentage too low)
  });

  it("reopens when net changes after acknowledgement", async () => {
    // Create variance finding, acknowledge
    // Change current run net pay
    // Rescan
    // Assert: Finding reopened (new evidence fingerprint)
  });
});
```

### 0D.3 Catalog Coverage Enforcement

**File**: `tests/findings/catalog-coverage.test.ts`

```ts
import { PAYRUN_ANOMALY_RULES, TRANSFER_ANOMALY_RULES } from "@/domain/findings/catalog";

// Maintain explicit registry of tested rules
const TESTED_PAYRUN_RULES = new Set([
  "PCB_UNVERIFIED",
  "NET_NEGATIVE",
  "NET_ZERO",
  "NET_VARIANCE_VS_PRIOR",
  "STATUTORY_STEP_SHIFT",
  "STATUTORY_ZERO_WITH_WAGES",
  "NEW_EMPLOYEE",
  "EMPLOYEE_OMITTED",
  "EIS_AGE_HISTORY_UNRESOLVED",
  "BANK_MISSING",
  "BANK_CHANGED",
  "OT_HOURS_OUTLIER",
  "OT_PAY_VS_BASIC_OUTLIER",
  "VARIABLE_ITEM_SPIKE",
  "OVERLAPPING_RUNS",
  // ... complete list
]);

const TESTED_TRANSFER_RULES = new Set([
  "TRANSFER_OVERLAP",
  "TRANSFER_EVIDENCE_MISSING",
  // ... complete list
]);

describe("findings catalog coverage", () => {
  it("every pay-run finding rule has detection tests", () => {
    const catalogRules = new Set(PAYRUN_ANOMALY_RULES.map(r => r.ruleId));
    expect(TESTED_PAYRUN_RULES).toEqual(catalogRules);
  });

  it("every transfer finding rule has detection tests", () => {
    const catalogRules = new Set(TRANSFER_ANOMALY_RULES.map(r => r.ruleId));
    expect(TESTED_TRANSFER_RULES).toEqual(catalogRules);
  });

  it("no tested rule is missing from catalog", () => {
    // Prevent orphaned test rules
    const allCatalogRules = new Set([
      ...PAYRUN_ANOMALY_RULES.map(r => r.ruleId),
      ...TRANSFER_ANOMALY_RULES.map(r => r.ruleId),
    ]);
    
    for (const testedRule of [...TESTED_PAYRUN_RULES, ...TESTED_TRANSFER_RULES]) {
      expect(allCatalogRules.has(testedRule)).toBe(true);
    }
  });
});
```

**Benefit**: Adding new finding to catalog without tests fails CI.

### 0D.4 Vertical Slice for High-Risk Findings

For critical findings (`PCB_UNVERIFIED`, `EIS_AGE_HISTORY_UNRESOLVED`, bank/release controls), trace end-to-end:
- Detection logic (`detectRunFindings`, `scanRunTransferFindings`)
- Persistence (`anomalyFindings` table)
- Gate evaluation (`evaluateGate`)
- UI display (findings panel)
- Acknowledgement workflow

**Test**: Add integration test demonstrating full lifecycle.

---

## Phase 1: Import Semantic Validation (Week 3, P1)

**Harden input integrity.**

### 1.1 Date Validation Layers

**Layer 1: Syntax validity** (current)
```ts
/^\d{4}-\d{2}-\d{2}$/  // ISO 8601 format
```

**Layer 2: Calendar validity** (add)
```ts
function isValidCalendarDate(isoDate: string): boolean {
  const [year, month, day] = isoDate.split("-").map(Number);
  
  // Reject invalid months/days
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  
  // Check actual calendar validity
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}
```

**Reject**:
- `2026-02-29` (not a leap year)
- `2026-04-31` (April has 30 days)
- `2026-13-01` (invalid month)
- `2026-00-15` (invalid day)

**Accept**:
- `2028-02-29` (leap year)
- Future dates (legitimate HR data for appointments)

**Layer 3: Business validity** (optional/domain-specific)
- DOB after join date → import error
- Unreasonable DOB (e.g., year < 1900) → warning or review finding
- Future join date → allow (legitimate)

**Test**: Expand `tests/domain/employee-row.test.ts`

```ts
describe("date validation", () => {
  it("rejects invalid calendar dates", () => {
    expect(parseEmployeeRow({ ...validRow, "Join Date": "2026-02-29" })).toHaveError("invalid date");
    expect(parseEmployeeRow({ ...validRow, "Join Date": "2026-04-31" })).toHaveError("invalid date");
  });

  it("accepts leap year dates", () => {
    expect(parseEmployeeRow({ ...validRow, "Join Date": "2028-02-29" })).toBeValid();
  });

  it("rejects DOB after join date", () => {
    expect(parseEmployeeRow({
      ...validRow,
      "Date of Birth": "2000-01-01",
      "Join Date": "1999-01-01"
    })).toHaveError("DOB after join date");
  });
});
```

### 1.2 Duplicate Employee Codes Within File

**Priority: High** (critical for batch integrity)

**Current risk**: Intra-file collision behavior may depend on database insert order

**Solution**: Validate entire batch before any mutations

```ts
interface BatchValidationResult {
  valid: boolean;
  errors: string[];
  duplicateCodes?: string[];
}

function validateBatch(rows: ParsedEmployeeRow[]): BatchValidationResult {
  const codes = new Map<string, number>();
  const duplicates = new Set<string>();
  
  for (const row of rows) {
    const key = `${row.payrollCompanyCode}:${row.employeeCode}`;
    const count = codes.get(key) ?? 0;
    codes.set(key, count + 1);
    
    if (count > 0) {
      duplicates.add(row.employeeCode);
    }
  }
  
  if (duplicates.size > 0) {
    return {
      valid: false,
      errors: [`Duplicate employee codes in file: ${Array.from(duplicates).join(", ")}`],
      duplicateCodes: Array.from(duplicates),
    };
  }
  
  return { valid: true, errors: [] };
}
```

**Test**: `tests/domain/employee-import-body.test.ts`

```ts
describe("batch validation", () => {
  it("rejects file with duplicate employee codes", () => {
    const rows = [
      { ...validRow1, employeeCode: "DLBB1001" },
      { ...validRow2, employeeCode: "DLBB1001" }, // duplicate
    ];
    
    const result = validateBatch(rows);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Duplicate employee codes");
  });

  it("allows duplicate codes across different companies", () => {
    const rows = [
      { ...validRow1, companyCode: "DLBB", employeeCode: "001" },
      { ...validRow2, companyCode: "AFENDA", employeeCode: "001" },
    ];
    
    const result = validateBatch(rows);
    expect(result.valid).toBe(true);
  });
});
```

### 1.3 Re-Import Policy

**Freeze create-only contract**:

```ts
// Existing (company, employeeCode) in database
→ SKIPPED_EXISTING (never silently update employee master)

// Duplicate (company, employeeCode) within incoming batch
→ batch validation error before any persistence
```

**Test**: `tests/db/employee-import.test.ts`

```ts
describe("re-import behavior", () => {
  it("skips existing employee codes", async () => {
    // Create employee DLBB1001
    // Import file containing DLBB1001
    // Assert: Row skipped with SKIPPED_EXISTING status
  });

  it("does not update existing employee data", async () => {
    // Create employee with baseRateSen = 500000
    // Import file with same code but baseRateSen = 600000
    // Assert: Original data unchanged
  });
});
```

### 1.4 Money Parsing Edge Cases

Verify `parseRM` handles:
- `"0.001"` → reject (more than 2 decimals)
- `"999999999.99"` → accept if within safe integer sen
- `"RM 1,234.56"` → reject or strip per contract
- Leading/trailing whitespace → trim then parse

**Test**: `tests/domain/money.test.ts` (may already exist, verify coverage)

---

## Phase 2: Selective Complexity Refactoring (Week 4+, P2)

**Only after P0-P1 complete.**

### 2.1 Extract Finding Detectors from `detectRunFindings`

**Precondition**: Detection matrix tests exist (Phase 0D)

**Pattern**: Extract one detector at a time

```ts
// Helper: Individual detector function
function detectPcbUnverified(
  line: LineScanRow,
  pcb: PcbEntry | undefined,
  runId: string
): DetectedFinding | null {
  const pcbApplicable = line.employeeSnapshot.pcbApplicable !== false;
  
  if (pcbApplicable && (pcb === undefined || !pcb.verified)) {
    return detected("PCB_UNVERIFIED", runId, line.lineId, {
      pcbAmountSen: pcb?.pcbAmountSen ?? null,
      verified: pcb?.verified ?? false,
    });
  }
  
  return null;
}

function detectNetNegative(line: LineScanRow, runId: string): DetectedFinding | null {
  if (line.netSen !== null && line.netSen < 0) {
    return detected("NET_NEGATIVE", runId, line.lineId, {
      netSen: line.netSen,
    });
  }
  return null;
}

// Main function becomes orchestration
async function detectRunFindings(
  db: DbOrTx,
  run: typeof payRuns.$inferSelect
): Promise<DetectedFinding[]> {
  // ... data loading (lines, pcb, employment, items, prior) ...
  
  const out: DetectedFinding[] = [];
  
  for (const line of lineRows) {
    const pcb = pcbByLine.get(line.lineId);
    const finding1 = detectPcbUnverified(line, pcb, run.id);
    if (finding1) out.push(finding1);
    
    const finding2 = detectNetNegative(line, run.id);
    if (finding2) out.push(finding2);
    
    // ... other detectors ...
  }
  
  return out;
}
```

**Process**:
1. Extract one detector to standalone function
2. Run existing tests (written in Phase 0D)
3. Verify no regression in detection behavior
4. Commit extraction
5. Repeat for next detector

**Success Metric**: `detectRunFindings` becomes comprehensible orchestration with domain detectors independently testable. Complexity reduction is a consequence, not an acceptance criterion.

### 2.2 Calculation Engine (Conditional)

**Only refactor if**:
- New statutory rule requires touching hotspot
- Duplicate logic risks divergence
- Correctness cannot be reviewed confidently

**Otherwise**: Leave `computeLine` / `deriveLine` untouched. Complexity acceptable when golden master passes.

**Process** (if triggered):
1. Add boundary tests for new rule (age transitions, band edges, ceiling cases)
2. Extract coherent responsibility
3. Run golden master + new boundary suite
4. Compare output identical
5. Commit with proof of equivalence

---

## Phase 3: Frontend Performance & Style (Week 5+, P3-P4)

**Deferred until P0-P2 complete.**

### 3.1 JSX Props Binding (P3)
- Only fix if profiling shows performance issue
- Extract callbacks to `useCallback` if needed
- Low priority: React re-renders may be acceptable for this UI

### 3.2 Marketing Tests (P4)
- Fix 3 failing marketing design tests before marketing release
- Text size validation, hover effects, layout rhythm
- Non-critical for payroll functionality

### 3.3 Style Fixes (P4)
- Apply 5 mechanical lint fixes opportunistically
- Template literal usage, formatting
- Can be done during other work

---

## Success Criteria

| Phase | Success Metric |
|-------|----------------|
| **P0A** | Control framework tests pass. Scan-revision binding proven. Gates enforce `blocks` array × severity. Approval immutability enforced. |
| **P0B** | Acknowledgement revision semantics defined and implemented. Tests prove revision binding. |
| **P0C** | Four suspicious gaps fixed. Tests demonstrate correct detection. |
| **P0D** | Every catalog rule has detection test. Catalog coverage enforcement in CI. |
| **P1** | Import rejects invalid calendar dates, duplicate codes within file. Re-import policy frozen. Edge cases tested. |
| **P2** | `detectRunFindings` refactored to orchestration. Domain detectors independently testable. No regressions. |
| **Golden Master** | **Continuously passing throughout all phases** |

## Overall Success

**Provable assurance that a payroll cannot progress because an intended control failed to observe, preserve, or correctly govern a condition it was designed to catch.**

Not: "complexity reduced"  
Not: "lint clean"  
But: **Every declared finding rule has explicit positive, negative, boundary and evidence assurance, materially reducing silent detector gaps.**

---

## Risk-Ranked Complexity Violations Reference

For context, the 12 complexity violations ranked by correctness risk:

| Rank | File/Function | Score | Risk | Coverage | Action |
|------|---------------|-------|------|----------|--------|
| **1** | `service/run-findings.ts:190` `detectRunFindings` | 114 | **CRITICAL** | Partial | **P0 test + refactor** |
| **2** | `service/run-findings.ts:104` `acknowledgeFinding` | 22 | HIGH | Partial | **P0B design decision** |
| **3** | `service/findings.ts:333` `scanRunTransferFindings` | 33 | HIGH | Minimal | **P0D test coverage** |
| **4** | `domain/import/employee-row.ts:192` `parseEmployeeRow` | 45 | HIGH | Good | **P1 edge cases** |
| **5** | `domain/derive/emit.ts:107` `deriveLine` | 34 | MED-HIGH | Excellent | **Defer** (golden master protected) |
| **6** | `domain/derive/emit.ts:771` `emitEpf` | 33 | MEDIUM | Excellent | **Defer** |
| **7** | `domain/calc/compose.ts:65` `computeLine` | 31 | MEDIUM | Excellent | **Defer** (golden master protected) |
| **8** | `domain/derive/invariants.ts:30` `assertNoDeadEnds` | 21 | MEDIUM | Good | **Defer** |
| **9** | `domain/derive/diff.ts:82` `diffGraphs` | 21 | LOW-MED | Good | **Defer** (UI concern) |
| **10** | `server/routes/pay-run-payslip.ts:107` Payslip endpoint | 36 | LOW-MED | Good | **P2 optional** |
| **11** | `service/release.ts:44` `previewRelease` | 21 | LOW-MED | Partial | **P2 optional** |
| **12** | `components/ui/chart.tsx:204` Chart tooltip | 22 | LOW | None | **Defer** (shadcn UI component) |

---

## Implementation Notes

### Findings Lifecycle Full Path

The complete control chain is:

```
detect → evidence → persist → acknowledge → rescan → gate → certify → freeze
```

Every phase of this chain must be testable and proven.

### Test Naming Convention

```ts
tests/findings/
  {domain}.test.ts           # Detector tests grouped by domain
  catalog-coverage.test.ts   # Meta: prove completeness
  scan-contract.test.ts      # Framework: scan machinery
  acknowledgement-lifecycle.test.ts  # Framework: ACK semantics
```

### Evidence Payload Standards

Every finding must include:
- Rule ID (implicit via `detected()`)
- Affected entity IDs (runId, lineId, employmentId as applicable)
- **Authoritative evidence**: Amounts, thresholds, baselines, references
- No computed explanations (save for UI layer)

Example:
```ts
detected("NET_VARIANCE_VS_PRIOR", runId, lineId, {
  netSen: 750000,
  baselineNetSen: 500000,
  baselineRunId: "uuid-of-prior-run",
  absVarianceSen: 250000,
  pct: 50,
})
```

### Rescan Behavior

Upsert finding by fingerprint:
- Same fingerprint + ACKNOWLEDGED → stay ACKNOWLEDGED
- Different fingerprint → reopen (status = OPEN)
- New revision + gate-relevant → reopen per acknowledgement policy (Phase 0B)

---

## Dependencies

- Phase 0B design decision must be resolved before large-scale detector testing
- Phase 0C fixes may discover additional framework gaps
- Phase 2 refactoring blocked until Phase 0D complete

## Timeline

- **Week 1**: P0A + P0B (control framework + acknowledgement semantics)
- **Week 1-2**: P0C (fix four suspicious paths)
- **Week 2-3**: P0D (catalog-complete detection assurance)
- **Week 3**: P1 (import semantic validation)
- **Week 4+**: P2 (selective refactoring behind proven tests)
- **Week 5+**: P3-P4 (frontend performance, marketing, style)

Total: **4-5 weeks** for P0-P1, then ongoing P2+ as needed.
