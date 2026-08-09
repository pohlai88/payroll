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

Current `recomputeRun()`:
1. Clears `findingsScannedRevision`
2. Creates new `calcRevision`
3. Commits calculation
4. Automatically calls `scanRunFindings()`
5. Successful scan stamps the new revision

**End states**:
- Successful recompute + successful scan → `findingsScannedRevision === calcRevision`
- New calculation revision before scan completes → prior scan authority invalid
- Failed/incomplete scan → `findingsScannedRevision` must NOT be advanced → all gates fail with SCAN_INCOMPLETE

**Critical invariant**: If calculation succeeds but findings scanning fails, the new revision must remain unscanned and every gate must fail closed.

**Test**: `tests/findings/scan-contract.test.ts`

```ts
describe("scan-revision binding", () => {
  it("successful recompute + scan stamps findingsScannedRevision = calcRevision", async () => {
    // Create run, recompute (service auto-scans)
    // Assert: run.findingsScannedRevision === run.calcRevision
  });

  it("new calcRevision before scan completes invalidates prior scan authority", async () => {
    // Scan findings (revision R1)
    // Begin recompute (clears scan stamp, creates R2)
    // Before scan completes
    // Assert: findingsScannedRevision !== calcRevision (stale)
  });

  it("failed scan leaves revision unscanned and gates fail closed", async () => {
    // Recompute succeeds (new calcRevision)
    // Scan fails (e.g., DB error)
    // Assert: findingsScannedRevision is null or stale
    // Evaluate gate
    // Assert: Gate fails with SCAN_INCOMPLETE
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

**Runtime gates**: `"REVIEW" | "APPROVAL" | "RELEASE" | "CLOSE"`

**Test**: Expand `tests/db/phase6-gates.test.ts`

```ts
describe("gate behavior", () => {
  it("BLOCKING finding in blocks array prevents gate", async () => {
    // Create BLOCKING finding with blocks: ["REVIEW"]
    // Evaluate REVIEW gate
    // Assert: Gate fails
  });

  it("WARNING finding not in blocks array does not prevent gate", async () => {
    // Create WARNING finding with blocks: ["APPROVAL"]
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

**Two layers**:
1. **Service guard**: `recomputeRun(APPROVED/CLOSED)` fails immediately with domain/control error
2. **Database trigger**: Final integrity wall (calculation rows refuse UPDATE/DELETE after DRAFT)

**Test**: Extend `tests/db/phase6-gates.test.ts`

```ts
describe("approval immutability", () => {
  it("APPROVED run cannot be recomputed (service layer)", async () => {
    // Approve run
    // Attempt recompute via service
    // Assert: Recompute rejected with ControlError before calculation work begins
  });

  it("APPROVED calculation data is immutable (database layer)", async () => {
    // Approve run
    // Attempt direct UPDATE on payLines/payLineItems/pcbEntries
    // Assert: Database trigger prevents mutation
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
- Payment-readiness findings block release for affected lines
- Release supports **partial release**: line-scoped gate failures exclude affected lines while eligible lines continue
- Run-scoped RELEASE issues must fail release entirely

**Test**: `tests/findings/payment-readiness.test.ts`

```ts
describe("release controls", () => {
  it("line-scoped RELEASE finding excludes affected line (partial release)", async () => {
    // Line A: missing bank details (BANK_DETAILS_MISSING with blocks: ["RELEASE"])
    // Line B: clean
    // previewRelease([A, B])
    // Assert: A excluded from eligible set, B remains eligible
  });

  it("run-scoped RELEASE finding blocks entire release", async () => {
    // Create run-level RELEASE finding (no lineId)
    // Attempt release of any lines
    // Assert: Release fails closed entirely
  });

  it("RELEASE finding not blocking APPROVAL allows approval", async () => {
    // Create RELEASE finding with blocks: ["RELEASE"] only
    // Evaluate APPROVAL gate
    // Assert: APPROVAL gate passes
  });
});
```

---

## Phase 0B: Acknowledgement Revision Semantics (Week 1, P0)

**Design Decision**: The current implementation appears evidence-bound (fingerprint-based reopening). The stronger invariant is revision-bound.

**Policy**:

> A non-INFO acknowledgement is certification of a finding at one calculation revision. A new calculation revision must require fresh acknowledgement for any finding that remains gate-relevant, even when its evidence fingerprint happens to remain identical.

**Recommended Implementation**: **Option 2 - Reopen on new revision without migration**

Existing schema:
- `detectedRevision`
- `fingerprint`
- `ackActor`, `ackAt`, `ackNote`
- `finding_events` (history table)

**Rescan semantics**:

```ts
// Same logical finding + same fingerprint + same revision
→ preserve state

// Same logical finding + same fingerprint + new calcRevision + ACKNOWLEDGED + gate-relevant
→ reopen
→ clear acknowledgement fields
→ detectedRevision = current revision
→ emit REOPENED event with reason=REVISION_CHANGED

// Same logical finding + changed fingerprint
→ reopen
→ clear acknowledgement
→ detectedRevision = current revision
→ emit REOPENED event with reason=EVIDENCE_CHANGED

// Same logical finding still OPEN on new revision
→ update detectedRevision to current revision
```

**Acknowledgement event evidence** (for historical proof):
```ts
{
  note,
  fingerprint,
  calcRevision  // Capture at acknowledgement time
}
```

**Benefit**: Achieves desired invariant without schema migration. Only add dedicated `ackRevision` column later if concrete query/reporting requirement emerges.

**Test**: `tests/findings/acknowledgement-lifecycle.test.ts`

```ts
describe("acknowledgement revision binding", () => {
  it("new calcRevision reopens acknowledged finding even with identical evidence", async () => {
    // Scan at R1, acknowledge
    // Recompute → R2 (evidence fingerprint unchanged)
    // Rescan
    // Assert: Finding reopened (status = OPEN)
    // Assert: Event emitted with reason=REVISION_CHANGED
  });

  it("evidence change reopens acknowledged finding", async () => {
    // Scan at R1, acknowledge
    // Change underlying data (new evidence fingerprint)
    // Rescan at R1
    // Assert: Finding reopened
    // Assert: Event emitted with reason=EVIDENCE_CHANGED
  });

  it("acknowledgement event captures calcRevision for audit trail", async () => {
    // Scan at R1
    // Acknowledge finding
    // Assert: Event record includes calcRevision=R1
  });

  it("OPEN finding on new revision updates detectedRevision", async () => {
    // Create OPEN finding at R1
    // Recompute → R2 (same fingerprint, still detected)
    // Assert: detectedRevision updated to R2
    // Assert: Status remains OPEN
  });
});
```

---

## Phase 0C: Suspicious Detector Remediation (Week 1-2, P0)

**Fix the four identified detector gaps immediately.**

### 0C.1 `NEW_EMPLOYEE` Detection Logic

**Current behavior**: Employee absent from baseline may skip detection. On first-ever payroll, everyone can qualify as NEW_EMPLOYEE.

**Policy Decision** (semantic correction):

> `NEW_EMPLOYEE` means a new arrival relative to an established payroll history, not "everyone in the system's first payroll."

**Policy**:
```ts
No eligible prior payroll baseline
→ do not emit NEW_EMPLOYEE

Eligible prior payroll baseline exists
AND employee has no prior payroll line
→ emit NEW_EMPLOYEE
```

**Test**: `tests/findings/workforce.test.ts`

```ts
describe("NEW_EMPLOYEE", () => {
  it("detects employee joining after prior monthly payroll exists", async () => {
    // Setup: Prior regular APPROVED run with baseline employees
    // Create new run with additional employee (not in baseline)
    // Scan findings
    // Assert: NEW_EMPLOYEE finding exists for new employee only
  });

  it("does not detect NEW_EMPLOYEE when no prior baseline exists (first payroll)", async () => {
    // Company's first-ever payroll run
    // All employees are technically new
    // Scan findings
    // Assert: No NEW_EMPLOYEE findings (no baseline to compare against)
  });

  it("does not detect NEW_EMPLOYEE for employee in previous run", async () => {
    // Prior run includes employee A
    // Current run includes employee A again
    // Assert: No NEW_EMPLOYEE for A
  });
});
```

**Action**: Implement policy as intentional semantic correction.

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

**Current thresholds**:
```ts
NET_VARIANCE_ABS_SEN = 30_000  // RM 300
NET_VARIANCE_PCT = 0.2         // 20% (stored as ratio 0.2, not integer 20)
```

**Evidence format**: `pct` is stored as **ratio**, not percentage integer:
```ts
{ pct: 0.5 }  // 50%, not 50
```

```ts
import { NET_VARIANCE_ABS_SEN, NET_VARIANCE_PCT } from "@/domain/findings/catalog";

describe("NET_VARIANCE_VS_PRIOR", () => {
  it("detects variance exceeding both absolute and percentage thresholds", async () => {
    // Use actual thresholds, not hardcoded values
    // Baseline: netSen = 100000 (RM 1,000.00)
    // Current: netSen = 135000 (RM 1,350.00)
    // Variance: abs = 35000 (RM 350), pct = 0.35 (35%)
    // Both exceed: abs (30000) and pct (0.2)
    
    const finding = await detectAndGetFinding("NET_VARIANCE_VS_PRIOR");
    
    expect(finding).toBeDefined();
    expect(finding.evidence).toEqual({
      netSen: 135000,
      baselineNetSen: 100000,
      baselineRunId: expect.any(String),
      absVarianceSen: 35000,
      pct: 0.35,  // ratio, not percentage
    });
  });

  it("does not detect when absolute threshold met but percentage threshold not met", async () => {
    // Baseline: netSen = 1000000 (RM 10,000)
    // Current: netSen = 1035000 (RM 10,350)
    // Variance: abs = 35000 (exceeds 30000), pct = 0.035 (3.5%, below 0.2)
    // Assert: No finding (percentage too low)
  });

  it("tests boundary conditions around thresholds", async () => {
    // abs == NET_VARIANCE_ABS_SEN → no finding (if using >)
    // abs == NET_VARIANCE_ABS_SEN + 1 → absolute side satisfied
    // pct == NET_VARIANCE_PCT → no finding
    // pct just above NET_VARIANCE_PCT → percentage side satisfied
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

**CRITICAL**: Use **exact catalog rule IDs** from runtime. Do not invent or approximate names.

Current examples (not exhaustive):
- Pay-run: `BANK_DETAILS_MISSING`, `BANK_DETAILS_CHANGED`, `OT_OUTLIER`, `EMPLOYEE_IN_OVERLAPPING_RUNS`
- Transfer: `TRANSFER_OVERLAP_DATES`, `PERSON_IN_BOTH_EMPLOYERS`, `TRANSFER_FINAL_PAY_MISSING`, `TRANSFER_PRIOR_TAX_MISSING`, `SERVICE_DATES_INCONSISTENT`, `RECEIVING_REGISTRATION_INVALID`

**Implementation**: Import actual catalogs and maintain tested registry with exact IDs.

```ts
import { PAYRUN_ANOMALY_RULES, TRANSFER_ANOMALY_RULES } from "@/domain/findings/catalog";

// Maintain explicit registry of tested rules
// **Use exact rule IDs from catalog - do not invent names**
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
  "BANK_DETAILS_MISSING",
  "BANK_DETAILS_CHANGED",
  "OT_OUTLIER",
  "VARIABLE_ITEM_SPIKE",
  "EMPLOYEE_IN_OVERLAPPING_RUNS",
  // ... complete with exact catalog IDs
]);

const TESTED_TRANSFER_RULES = new Set([
  "TRANSFER_OVERLAP_DATES",
  "PERSON_IN_BOTH_EMPLOYERS",
  "TRANSFER_FINAL_PAY_MISSING",
  "TRANSFER_PRIOR_TAX_MISSING",
  "SERVICE_DATES_INCONSISTENT",
  "RECEIVING_REGISTRATION_INVALID",
  // ... complete with exact catalog IDs
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

**Action for Implementation**: Before writing tests, export actual catalog and verify all rule IDs. Do not proceed with invented names.

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

**CRITICAL**: Reuse existing canonical date primitives from `src/domain/date.ts`:
```ts
isIsoDate(value)        // Validates ISO format + real calendar date
parseIsoDate(value, what)
isRealDate(y, m, d)     // Already uses UTC and rejects impossible dates
```

**Do not introduce a second ISO/calendar implementation.**

**Layer 1: Syntax validity** (current)
```ts
/^\d{4}-\d{2}-\d{2}$/  // ISO 8601 format
```

**Layer 2: Calendar validity** (use `isIsoDate()`)
- Rejects: `2026-02-29`, `2026-04-31`, `2026-13-01`, `2026-00-15`
- Accepts: `2028-02-29` (leap year), future dates

**Layer 3: Business validity** (optional/domain-specific)
- DOB after join date → import error
- Unreasonable DOB (e.g., year < 1900) → warning or review finding
- Future join date → **allow** (legitimate HR data for future appointments)

**Test**: Expand `tests/domain/employee-row.test.ts`

```ts
import { isIsoDate } from "@/domain/date";

describe("date validation", () => {
  it("rejects invalid calendar dates using isIsoDate", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-04-31")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    
    expect(parseEmployeeRow({ ...validRow, "Join Date": "2026-02-29" }))
      .toHaveError("invalid date");
  });

  it("accepts leap year dates", () => {
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(parseEmployeeRow({ ...validRow, "Join Date": "2028-02-29" }))
      .toBeValid();
  });

  it("rejects DOB after join date", () => {
    expect(parseEmployeeRow({
      ...validRow,
      "Person DOB": "2000-01-01",  // Correct header: "Person DOB", not "Date of Birth"
      "Join Date": "1999-01-01"
    })).toHaveError("DOB after join date");
  });

  it("allows future join dates", () => {
    expect(parseEmployeeRow({
      ...validRow,
      "Join Date": "2027-01-01"  // Future appointment
    })).toBeValid();
  });
});
```

**Action**: Import validation must delegate to `isIsoDate()` - do not duplicate calendar logic.

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
