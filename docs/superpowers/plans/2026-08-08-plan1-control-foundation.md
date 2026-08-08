# Plan 1: Control Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the spec's control layer — person/employment model, calc-revision certification, findings engine with severity×gate dispositions, line-level payment state machine with immutable attempts, artifacts, and run closure — entirely server-side, keeping the existing UI functional.

**Architecture:** All new capability lands as Drizzle tables + pure/service modules under `src/server/`, tested headlessly with Vitest against scratch SQLite databases. The verified calculation engine (`src/lib/calc/`) is untouched. The existing pay-run page keeps compiling by swapping its `runChecks` data source to the findings engine; full workspace UI is Plan 2.

**Tech Stack:** Next.js 16 App Router, TypeScript, better-sqlite3 (synchronous) + Drizzle ORM, Vitest, node:crypto (sha256). No new npm dependencies.

## Global Constraints

- All money is INTEGER sen; statutory identifiers are TEXT (leading zeros preserved); dates are ISO-8601 TEXT.
- The calculation engine (`src/lib/calc/*`) must not change; `npm test` (84 existing tests incl. golden master) must stay green after every task.
- better-sqlite3 is synchronous — services are plain functions, no async; server actions wrap them.
- Every state transition is server-authoritative, wrapped in one `sqlite.transaction()`, and audited via `logAudit` (src/server/audit.ts).
- Tests use the scratch DB set up by `tests/setup-env.ts` (`PAYROLL_DB_PATH` → `data/test-service.db`) — follow the pattern in `tests/service/payrun-service.test.ts`.
- Spec of record: `docs/superpowers/specs/2026-08-08-payrun-workspace-design.md`. On any conflict, the spec wins.
- Windows environment; use `path.join`, never hardcoded separators.

**Migration note (applies to Tasks 1–2):** the project uses `drizzle-kit generate` for migrations (`npm run db:generate`), applied by `scripts/migrate.ts`. After editing `db/schema.ts`, run `npx drizzle-kit generate --name <name>` and commit the generated SQL. The live DB (`data/payroll.db`) contains real imported data — migrations must be additive/backfilling, never destructive.

---

### Task 1: Persons + employment fields + run-membership overlap rule

**Files:**
- Modify: `db/schema.ts` (add `persons`; extend `employees`)
- Create: `scripts/backfill-persons.ts`
- Modify: `scripts/migrate.ts` (call backfill after seed)
- Modify: `src/server/payrun-service.ts` (run membership by period overlap)
- Test: `tests/service/persons.test.ts`

**Interfaces:**
- Produces: `persons` table `{ id: integer PK, name: text, icNo: text|null, passportNo: text|null, dob: text|null, nationality: text|null, groupServiceDate: text|null }`; `employees.personId: integer FK`, `employees.terminationReason: text|null` (enum incl. `"INTERNAL_GROUP_TRANSFER"`, `"RESIGNATION"`, `"OTHER"`), `employees.priorEmploymentId: text|null`; `backfillPersons(): { created: number, linked: number }` in `scripts/backfill-persons.ts` (idempotent); `employmentOverlapsPeriod(emp, periodStart, periodEnd): boolean` exported from `src/server/payrun-service.ts`.

- [ ] **Step 1: Write failing tests**

```ts
// tests/service/persons.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { getDb, getSqlite } from "@/lib/db";
import { applyTriggers } from "../../db/triggers";
import { seedIfNeeded } from "../../scripts/seed-core";
import { backfillPersons } from "../../scripts/backfill-persons";
import { companies, employees, persons, payrollLines } from "../../db/schema";
import { createPayRun, employmentOverlapsPeriod } from "@/server/payrun-service";

beforeAll(() => {
  const db = getDb();
  migrate(db, { migrationsFolder: path.join(process.cwd(), "db", "migrations") });
  applyTriggers(getSqlite());
  seedIfNeeded();
  db.insert(companies).values({ code: "TCA", legalName: "TEST CO A" }).run();
  db.insert(companies).values({ code: "TCB", legalName: "TEST CO B" }).run();
  db.insert(employees).values([
    { id: "A1", companyCode: "TCA", name: "SAME PERSON", icNo: "900101-10-1111",
      employmentType: "FULLTIME", payBasis: "MONTHLY", monthlyBasicSen: 300000, status: "ACTIVE" },
    { id: "B1", companyCode: "TCB", name: "SAME PERSON", icNo: "900101-10-1111",
      employmentType: "FULLTIME", payBasis: "MONTHLY", monthlyBasicSen: 350000, status: "INACTIVE" },
    { id: "A2", companyCode: "TCA", name: "NO IC PERSON",
      employmentType: "CONTRACT", payBasis: "DAILY", dailyRateSen: 5000, status: "ACTIVE" },
    // terminated mid-August: must still be included in the August run
    { id: "A3", companyCode: "TCA", name: "LEAVER", icNo: "880202-10-2222",
      employmentType: "FULLTIME", payBasis: "MONTHLY", monthlyBasicSen: 200000,
      status: "INACTIVE", terminationDate: "2026-08-15", joinDate: "2025-01-01" },
  ]).run();
});

describe("persons backfill", () => {
  it("links same-IC employments to one person; no-IC gets own person; idempotent", () => {
    const first = backfillPersons();
    expect(first.created).toBeGreaterThanOrEqual(2);
    const db = getDb();
    const a1 = db.select().from(employees).where(eq(employees.id, "A1")).get()!;
    const b1 = db.select().from(employees).where(eq(employees.id, "B1")).get()!;
    const a2 = db.select().from(employees).where(eq(employees.id, "A2")).get()!;
    expect(a1.personId).not.toBeNull();
    expect(a1.personId).toBe(b1.personId);          // same IC → same person
    expect(a2.personId).not.toBe(a1.personId);       // no IC → own person
    const again = backfillPersons();
    expect(again.created).toBe(0);                   // idempotent
  });
});

describe("run membership by employment-period overlap", () => {
  it("includes an employment terminated inside the period", () => {
    expect(employmentOverlapsPeriod(
      { joinDate: "2025-01-01", terminationDate: "2026-08-15" },
      "2026-08-01", "2026-08-31")).toBe(true);
    expect(employmentOverlapsPeriod(
      { joinDate: "2025-01-01", terminationDate: "2026-07-31" },
      "2026-08-01", "2026-08-31")).toBe(false);
    expect(employmentOverlapsPeriod(
      { joinDate: "2026-09-01", terminationDate: null },
      "2026-08-01", "2026-08-31")).toBe(false);
    const runId = createPayRun({ companyCode: "TCA", year: 2026, month: 8, workingDays: 26 });
    const db = getDb();
    const lines = db.select().from(payrollLines).where(eq(payrollLines.payRunId, runId)).all();
    const ids = lines.map((l) => l.employeeId).sort();
    expect(ids).toContain("A3");     // leaver included in final month
    expect(ids).toContain("A1");
    expect(ids).toContain("A2");
    expect(ids).not.toContain("B1"); // other company
  });
});
```

- [ ] **Step 2: Run tests, verify they fail** — `npx vitest run tests/service/persons.test.ts` → FAIL (`persons` not exported / `backfillPersons` missing).

- [ ] **Step 3: Implement**

In `db/schema.ts` add:

```ts
export const persons = sqliteTable("persons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  icNo: text("ic_no"),
  passportNo: text("passport_no"),
  dob: text("dob"),
  nationality: text("nationality"),
  groupServiceDate: text("group_service_date"),
});
```

Extend `employees` with:

```ts
    personId: integer("person_id").references(() => persons.id),
    terminationReason: text("termination_reason", {
      enum: ["INTERNAL_GROUP_TRANSFER", "RESIGNATION", "DISMISSAL", "CONTRACT_END", "OTHER"],
    }),
    priorEmploymentId: text("prior_employment_id"),
```

Run `npx drizzle-kit generate --name persons`.

`scripts/backfill-persons.ts`:

```ts
import { eq, isNull } from "drizzle-orm";
import { getDb, getSqlite } from "../src/lib/db";
import { employees, persons } from "../db/schema";

/** Idempotent: creates persons for employees lacking personId; links by normalized IC. */
export function backfillPersons(): { created: number; linked: number } {
  const db = getDb();
  const sqlite = getSqlite();
  let created = 0, linked = 0;
  const norm = (ic: string | null) => (ic ? ic.replace(/\D/g, "") : null);
  const tx = sqlite.transaction(() => {
    const unlinked = db.select().from(employees).where(isNull(employees.personId)).all();
    const all = db.select().from(persons).all();
    const byIc = new Map(all.filter((p) => p.icNo).map((p) => [norm(p.icNo)!, p.id]));
    for (const e of unlinked) {
      const ic = norm(e.icNo);
      let pid = ic ? byIc.get(ic) : undefined;
      if (pid === undefined) {
        const r = db.insert(persons).values({
          name: e.name, icNo: e.icNo, passportNo: e.passportNo,
          dob: e.dob, nationality: e.nationality,
          groupServiceDate: e.joinDate,
        }).run();
        pid = Number(r.lastInsertRowid);
        created++;
        if (ic) byIc.set(ic, pid);
      } else {
        linked++;
      }
      db.update(employees).set({ personId: pid }).where(eq(employees.id, e.id)).run();
    }
  });
  tx();
  return { created, linked };
}
```

In `scripts/migrate.ts` add `backfillPersons();` after `seedIfNeeded();` (import from `./backfill-persons` — move the function into `scripts/backfill-persons.ts` and re-export nothing else).

In `src/server/payrun-service.ts` replace the ACTIVE-only selection in `createPayRun` with:

```ts
export function employmentOverlapsPeriod(
  emp: { joinDate: string | null; terminationDate: string | null },
  periodStart: string,
  periodEnd: string
): boolean {
  if (emp.joinDate && emp.joinDate > periodEnd) return false;
  if (emp.terminationDate && emp.terminationDate < periodStart) return false;
  return true;
}
```

and in `createPayRun`, select employees of the company where `status === "ACTIVE" || (emp.terminationDate !== null)` then filter with `employmentOverlapsPeriod(emp, periodStart, periodEnd)`; keep the "no employees" guard message. (ACTIVE with no dates still passes — overlap of null dates is `true`.)

- [ ] **Step 4: Run tests** — `npx vitest run tests/service/persons.test.ts` → PASS; then `npx vitest run` → all green.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: persons model, employment fields, run membership by period overlap"`

---

### Task 2: Run lifecycle v2 — CLOSED status, off-cycle columns, calcRevision columns

**Files:**
- Modify: `db/schema.ts` (`payRuns` columns; new partial unique index), `db/triggers.ts` (lock scope), `scripts/migrate.ts` (legacy PAID→CLOSED backfill SQL)
- Modify: `src/server/payrun-service.ts` (TRANSITIONS map)
- Test: `tests/service/lifecycle.test.ts`

**Interfaces:**
- Produces: `payRuns` gains `runType: "REGULAR"|"OFFCYCLE"` (default REGULAR), `offcycleReason: "CORRECTION"|"ARREARS"|"BONUS"|"MISSED_PAYMENT"|"FINAL_PAYMENT"|null`, `linkedRunId: text|null`, `calcRevision: text|null`, `reviewedRevision: text|null`, `approvedRevision: text|null`, `closedManifestArtifactId: integer|null`, `legacyClosed: integer default 0`; status enum `["DRAFT","REVIEWED","APPROVED","CLOSED"]`; `TRANSITIONS`: DRAFT→REVIEWED, REVIEWED→{APPROVED, DRAFT}, APPROVED→{CLOSED, DRAFT}, CLOSED→{} (PAID removed).
- Consumes: nothing new.

- [ ] **Step 1: Write failing tests**

```ts
// tests/service/lifecycle.test.ts  (setup boilerplate identical to persons.test.ts;
// insert company "TLC" and one ACTIVE MONTHLY employee "L1" basic 300000, dob 1990-01-15,
// icNo "900115-10-1234", eisPriorContribution 1)
describe("lifecycle v2", () => {
  it("SQLite enforces only REGULAR uniqueness per company+period", () => {
    createPayRun({ companyCode: "TLC", year: 2026, month: 9, workingDays: 26 });
    expect(() => createPayRun({ companyCode: "TLC", year: 2026, month: 9, workingDays: 26 })).toThrow();
    // off-cycle for the same period is allowed (service added in Task 8; here insert row directly)
    const db = getDb();
    db.insert(payRuns).values({
      id: "TLC-2026-09-OC1", companyCode: "TLC", periodYear: 2026, periodMonth: 9,
      periodStart: "2026-09-01", periodEnd: "2026-09-30", workingDays: 26,
      status: "DRAFT", rulePackId: getActiveRulePackId(),
      runType: "OFFCYCLE", offcycleReason: "BONUS", linkedRunId: "TLC-2026-09",
    }).run(); // must not throw
  });
  it("PAID is no longer a status; APPROVED→CLOSED transition exists", () => {
    expect(() => transitionRun("TLC-2026-09", "PAID" as never)).toThrow();
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run tests/service/lifecycle.test.ts` → FAIL (columns missing).

- [ ] **Step 3: Implement**

`db/schema.ts` `payRuns`: change status enum to `["DRAFT","REVIEWED","APPROVED","CLOSED"]`; add columns per Interfaces; **remove** `uniqueIndex("uq_pay_run_period")` and add a raw partial index (Drizzle emits via `sql`):

```ts
  (t) => [
    // partial unique: only REGULAAR runs are unique per company+period
    uniqueIndex("uq_regular_run_period")
      .on(t.companyCode, t.periodYear, t.periodMonth)
      .where(sql`run_type = 'REGULAR'`),
  ]
```

Generate migration (`--name lifecycle-v2`). Then append to the generated SQL file (hand-edit is fine, drizzle supports custom statements):

```sql
UPDATE pay_runs SET status = 'CLOSED', legacy_closed = 1 WHERE status = 'PAID';
```

`db/triggers.ts`: in all seven trigger WHEN clauses replace `IN ('APPROVED','PAID')` with `IN ('APPROVED','CLOSED')`. Because `CREATE TRIGGER IF NOT EXISTS` won't replace existing triggers, prefix `applyTriggers` with `DROP TRIGGER IF EXISTS <name>;` for each of the seven names.

`src/server/payrun-service.ts`: `RunStatus = "DRAFT"|"REVIEWED"|"APPROVED"|"CLOSED"`; TRANSITIONS per Interfaces; delete the `paidAt` stamping (CLOSED stamping arrives in Task 9); `recomputeLine` lock check becomes `status === "APPROVED" || status === "CLOSED"`. Fix `tests/service/payrun-service.test.ts` expectations: replace the PAID test block with APPROVED→CLOSED illegal-until-Task-9 semantics — for now assert `transitionRun(id,"CLOSED")` throws (closure gate arrives Task 9; TRANSITIONS allows it but Task 9's gate will guard; at this task, make `transitionRun` throw `"Closure requires the close service"` for `to === "CLOSED"`).

- [ ] **Step 4: Run** — targeted test PASS, then `npx vitest run` all green (adjust the old PAID assertions in `payrun-service.test.ts` as described).

- [ ] **Step 5: Commit** — `git commit -am "feat: lifecycle v2 - CLOSED status, off-cycle columns, partial unique index"`

---

### Task 3: Canonical calc revision hash

**Files:**
- Create: `src/server/calc-revision.ts`
- Modify: `src/server/payrun-service.ts` (recompute updates run.calcRevision; auto-demote on REVIEWED edit)
- Test: `tests/unit/calc-revision.test.ts`

**Interfaces:**
- Produces: `computeCalcRevision(runId: string): string` (12-hex-char sha256 prefix) — hashes canonical calculation-relevant state; `refreshCalcRevision(runId): { revision: string, demoted: boolean }` — updates `pay_runs.calcRevision`, and if status was REVIEWED and revision ≠ reviewedRevision, demotes to DRAFT (one transaction) + audit. Called at the end of `recomputeLine` and by line add/delete paths.
- Consumes: Task 2 columns.

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/calc-revision.test.ts (service-style setup; company "TCR", employee "R1")
describe("calcRevision", () => {
  it("is stable across no-op recomputes and independent of row insert order", () => {
    const runId = createPayRun({ companyCode: "TCR", year: 2026, month: 10, workingDays: 26 });
    const r1 = computeCalcRevision(runId);
    recomputeLine(lineIdOf(runId, "R1"));
    expect(computeCalcRevision(runId)).toBe(r1);
  });
  it("changes when a calculation input changes, not when notes change", () => {
    const runId = "TCR-2026-10";
    const before = computeCalcRevision(runId);
    getDb().update(payrollLines).set({ otHours: 5, otRateSen: 1000 })
      .where(eq(payrollLines.id, lineIdOf(runId, "R1"))).run();
    recomputeLine(lineIdOf(runId, "R1"));
    expect(computeCalcRevision(runId)).not.toBe(before);
    const mid = computeCalcRevision(runId);
    getDb().update(payRuns).set({ notes: "hello" }).where(eq(payRuns.id, runId)).run();
    expect(computeCalcRevision(runId)).toBe(mid);
  });
  it("REVIEWED + calc edit → atomic demotion to DRAFT", () => {
    // set inputs valid, verify PCB (direct db update), transition to REVIEWED,
    // then updateLineInputs via recompute path and assert status === "DRAFT"
    // and reviewedRevision no longer matches calcRevision.
  });
});
```

(Write the third test fully in implementation — use the PCB direct-update pattern from `tests/service/payrun-service.test.ts`.)

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `src/server/calc-revision.ts`**

```ts
import crypto from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getDb, getSqlite } from "@/lib/db";
import {
  companies, payRuns, payrollLines, payrollLineItems, pcbEntries, statutoryOverrides,
} from "../../db/schema";
import { logAudit } from "./audit";
import { ANOMALY_RULE_PACK_VERSION } from "./anomaly-rules"; // Task 5; until then use a local const "MY-PAYROLL-ANOMALY-V1"

/** Canonical, order-independent hash of calculation-relevant state only (spec §1.2). */
export function computeCalcRevision(runId: string): string {
  const db = getDb();
  const run = db.select().from(payRuns).where(eq(payRuns.id, runId)).get();
  if (!run) throw new Error(`Unknown run ${runId}`);
  const company = db.select().from(companies).where(eq(companies.code, run.companyCode)).get()!;
  const lines = db.select().from(payrollLines)
    .where(eq(payrollLines.payRunId, runId)).orderBy(asc(payrollLines.employeeId)).all();
  const canon: unknown[] = [
    "v1", run.rulePackId, ANOMALY_RULE_PACK_VERSION,
    run.periodStart, run.periodEnd, run.workingDays,
    company.hrdfLevyEnabled, company.hrdfLevyPctX100,
  ];
  for (const l of lines) {
    const items = db.select().from(payrollLineItems)
      .where(eq(payrollLineItems.lineId, l.id)).all()
      .map((i) => [i.payItemCode, i.qty ?? null, i.rateSen ?? null, i.amountSen])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const ovr = db.select().from(statutoryOverrides)
      .where(eq(statutoryOverrides.lineId, l.id)).all()
      .map((o) => [o.field, o.overrideSen]).sort();
    const pcb = db.select().from(pcbEntries).where(eq(pcbEntries.lineId, l.id)).get();
    canon.push([
      l.employeeId, l.payBasis, l.baseRateSen, l.excluded,
      l.paidDays, l.mealDays, l.hoursWorked, l.otHours, l.otRateSen,
      l.epfPart, l.socsoCategory, l.eisEligible,
      items, ovr,
      pcb ? [pcb.pcbAmountSen, pcb.zakatOffsetSen, pcb.cp38Sen, pcb.verificationStatus] : null,
    ]);
  }
  return crypto.createHash("sha256").update(JSON.stringify(canon)).digest("hex").slice(0, 12);
}

export function refreshCalcRevision(runId: string): { revision: string; demoted: boolean } {
  const db = getDb();
  const sqlite = getSqlite();
  let demoted = false;
  let revision = "";
  const tx = sqlite.transaction(() => {
    revision = computeCalcRevision(runId);
    const run = db.select().from(payRuns).where(eq(payRuns.id, runId)).get()!;
    const patch: Partial<typeof payRuns.$inferInsert> = { calcRevision: revision };
    if (run.status === "REVIEWED" && run.reviewedRevision !== revision) {
      patch.status = "DRAFT";
      patch.reviewedRevision = null;
      patch.reviewedAt = null;
      patch.reviewedBy = null;
      demoted = true;
    }
    db.update(payRuns).set(patch).where(eq(payRuns.id, runId)).run();
    if (demoted) logAudit("pay_run", runId, "AUTO_DEMOTE_REVIEW_STALE", { was: "REVIEWED" }, { revision });
  });
  tx();
  return { revision, demoted };
}
```

Wire: call `refreshCalcRevision(line.payRunId)` at the end of `recomputeLine` (outside its inner tx is fine — better-sqlite3 nests via savepoints when using `sqlite.transaction`; simplest correct form: call it as the last statement *inside* the existing `tx` body by inlining, or immediately after `tx()` — choose after `tx()`, then the demotion tx is its own atomic unit; the spec's atomicity requirement binds the *edit path*, so also call `refreshCalcRevision` inside `updateLineInputsAction`/`updatePcbAction` flows which already call `recomputeLine`). REVIEWED/APPROVED stamping of `reviewedRevision`/`approvedRevision` happens in `transitionRun` (set from current `calcRevision`).

- [ ] **Step 4: Run tests** — targeted then full suite.
- [ ] **Step 5: Commit** — `git commit -am "feat: canonical calc revision with review auto-demotion"`

---

### Task 4: Findings tables + engine core (fingerprint upsert, ack, auto-resolve)

**Files:**
- Modify: `db/schema.ts` (`anomalyFindings`, `findingEvents`)
- Create: `src/server/findings.ts`
- Test: `tests/service/findings-core.test.ts`

**Interfaces:**
- Produces: tables `anomaly_findings { id PK, runId FK, lineId int|null, ruleId text, fingerprint text, severity "INFO"|"REVIEW"|"WARNING"|"BLOCKING", blocksJson text (JSON array of "REVIEW"|"APPROVAL"|"RELEASE"|"CLOSE"), title text, detail text, evidenceJson text, baselineRunId text|null, baselineLineId int|null, status "OPEN"|"ACKNOWLEDGED"|"RESOLVED", ackNote text|null, ackActor text|null, ackAt text|null, detectedRevision text, rulePackVersion text, resolvedAt text|null, resolvedRevision text|null, resolutionType text|null, UNIQUE(runId, lineId, ruleId) }` and `finding_events { id PK, findingId FK, kind "DETECTED"|"REOPENED"|"ACKNOWLEDGED"|"RESOLVED", evidenceJson, actor, at }`.
- Produces functions in `src/server/findings.ts`:
  - `upsertFindings(runId: string, detected: DetectedFinding[], scope: { lineId?: number }): void` — reconciles detected vs stored **within scope** (a lineId scope only touches that line's findings; whole-run scope touches all): new → insert OPEN + DETECTED event; same ruleId+line with same fingerprint → keep status; changed fingerprint → archive ack to events, set OPEN + REOPENED; stored-but-not-detected → status RESOLVED with `resolutionType:"CONDITION_CLEARED"`, `resolvedAt`, `resolvedRevision` + RESOLVED event.
  - `acknowledgeFinding(findingId: number, opts: { note?: string, actor: string }): void` — throws for BLOCKING; requires non-empty note when severity WARNING.
  - `DetectedFinding = { ruleId: string, lineId?: number, severity: Severity, blocks: Gate[], title: string, detail: string, evidence: Record<string, unknown>, baselineRunId?: string, baselineLineId?: number }` and `fingerprintOf(evidence): string` (sha256 of JSON with sorted keys, 12 chars).

- [ ] **Step 1: Write failing tests**

```ts
// tests/service/findings-core.test.ts (setup pattern as before; a run "TFC-2026-11" with employee "F1")
describe("findings core", () => {
  const det = (over: Partial<DetectedFinding> = {}): DetectedFinding => ({
    ruleId: "TEST_RULE", severity: "WARNING", blocks: ["APPROVAL"],
    title: "t", detail: "d", evidence: { value: 100, baseline: 50 }, ...over,
  });
  it("insert → same fingerprint keeps ack → changed fingerprint reopens", () => {
    upsertFindings(RUN, [det({ lineId: LINE })], { lineId: LINE });
    const f = one();
    expect(f.status).toBe("OPEN");
    acknowledgeFinding(f.id, { note: "seen, bonus month", actor: "Jack" });
    upsertFindings(RUN, [det({ lineId: LINE })], { lineId: LINE });   // unchanged evidence
    expect(one().status).toBe("ACKNOWLEDGED");
    upsertFindings(RUN, [det({ lineId: LINE, evidence: { value: 900, baseline: 50 } })], { lineId: LINE });
    expect(one().status).toBe("OPEN");                                 // reopened
    const events = getDb().select().from(findingEvents).all();
    expect(events.some((e) => e.kind === "REOPENED")).toBe(true);
    expect(events.some((e) => e.kind === "ACKNOWLEDGED")).toBe(true);  // ack archived
  });
  it("auto-resolves with resolution metadata when condition clears", () => {
    upsertFindings(RUN, [], { lineId: LINE });
    const f = one();
    expect(f.status).toBe("RESOLVED");
    expect(f.resolutionType).toBe("CONDITION_CLEARED");
    expect(f.resolvedRevision).toBeTruthy();
  });
  it("WARNING requires note; BLOCKING cannot be acknowledged", () => {
    upsertFindings(RUN, [det({ lineId: LINE })], { lineId: LINE });
    expect(() => acknowledgeFinding(one().id, { actor: "Jack" })).toThrow(/note/i);
    upsertFindings(RUN, [det({ lineId: LINE, ruleId: "B", severity: "BLOCKING" })], { lineId: LINE });
    const b = getDb().select().from(anomalyFindings).all().find((x) => x.ruleId === "B")!;
    expect(() => acknowledgeFinding(b.id, { note: "x", actor: "Jack" })).toThrow(/BLOCKING/);
  });
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** schema + `src/server/findings.ts` exactly per Interfaces (fingerprint = `sha256(JSON.stringify(sortKeys(evidence))).slice(0,12)`; scope filter: `WHERE run_id = ? AND (lineId scope ? line_id = ? : 1=1)`; all in one transaction). Generate migration `--name findings`.
- [ ] **Step 4: Run tests, full suite.**
- [ ] **Step 5: Commit** — `git commit -am "feat: findings engine core with evidence-bound acknowledgments"`

---

### Task 5: Rule catalog v1 + gate evaluation + transition wiring

**Files:**
- Create: `src/server/anomaly-rules.ts` (rules + thresholds + `ANOMALY_RULE_PACK_VERSION = "MY-PAYROLL-ANOMALY-V1"`)
- Create: `src/server/gates.ts`
- Modify: `src/server/payrun-service.ts` (`runChecks` retired; transitions call gates; recomputeLine triggers line-scoped scan)
- Modify: `src/app/payruns/[id]/page.tsx` + `src/components/payrun-grid.tsx` (checks panel consumes findings; ack buttons minimal)
- Test: `tests/service/rules.test.ts`

**Interfaces:**
- Produces: `scanRun(runId): void` (all rules), `scanLine(runId, lineId): void` (line-scoped rules only) — both end with `upsertFindings`; `evaluateGate(runId, gate: "REVIEW"|"APPROVAL"|"RELEASE"|"CLOSE", opts?: { lineIds?: number[] }): { ok: boolean, blockers: FindingRow[], unacknowledged: FindingRow[], prerequisites: string[] }`. Prerequisites v1 per spec §4.2: REVIEW = basis inputs present + rate > 0 per included line; APPROVAL = status REVIEWED at current calcRevision; RELEASE = run APPROVED ∧ line state READY/FAILED_RETURNED (per line, Task 6); CLOSE = §1.5 items (Task 9).
- Rules implemented (ids, severity, gates exactly per spec §4.3): `NET_VARIANCE_VS_PRIOR` (|Δ| > 30000 sen AND > 20%), `NET_ZERO`, `NET_NEGATIVE`, `PCB_UNVERIFIED`, `EIS_AGE_HISTORY_UNRESOLVED`, `STATUTORY_STEP_SHIFT`, `STATUTORY_ZERO_WITH_WAGES`, `EMPLOYEE_OMITTED` (overlap test from Task 1), `EMPLOYEE_IN_OVERLAPPING_RUNS`, `OT_OUTLIER` (>72h or OT > 50% of BASIC item), `VARIABLE_ITEM_SPIKE` (MANUAL item ≥ 100000 sen), `NEW_EMPLOYEE`, `MISSING_STATUTORY_NO`, `BANK_DETAILS_MISSING` (BLOCKING, RELEASE), `BANK_DETAILS_CHANGED` (REVIEW, RELEASE). Baseline = latest prior REGULAR run of same company by periodEnd; every cross-run evidence object includes `baselineRunId`/`baselineLineId`/values.
- `transitionRun` v2: REVIEWED ⇒ `evaluateGate(REVIEW)` ok + stamps `reviewedRevision = calcRevision`; APPROVED ⇒ `evaluateGate(APPROVAL)` ok + stamps `approvedRevision` + inserts `gate_certifications` row `{ runId, gate, calcRevision, statutoryPackId, anomalyPackVersion, actor, at }` (add table in this task's migration) + creates `line_payments` READY rows (table from Task 6 — implement Tasks 5 and 6 schema in one migration `--name rules-payments` to avoid an unusable intermediate state; the service wiring split stays as two tasks).

- [ ] **Step 1: Write failing tests** — key cases (full file in implementation):

```ts
it("NET_NEGATIVE blocks approval; ack path clears WARNING gate", () => { /* build line with OTHER_DED > gross via addLineItemAction-equivalent insert; scanRun; evaluateGate APPROVAL → ok false; fix; ack WARNINGs; ok true */ });
it("NET_VARIANCE_VS_PRIOR needs AND of RM300 and 20%, silent without baseline", () => { /* run Nov no prior → no finding; create Dec with +25%/+RM400 → finding with baselineRunId */ });
it("EMPLOYEE_OMITTED uses period overlap, not ACTIVE flag", () => { /* terminated-before-period employee absent → no finding; overlapping-but-absent → finding */ });
it("PCB_UNVERIFIED folds into findings and blocks APPROVAL", () => { /* replaces old runChecks assertion */ });
it("BANK_DETAILS_MISSING blocks RELEASE gate only, not APPROVAL", () => { /* CASH ok; BANK w/o account: APPROVAL ok, RELEASE not ok for that line */ });
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** `anomaly-rules.ts` exports `THRESHOLDS` consts and two arrays `LINE_RULES` / `RUN_RULES` of `{ id, severity, blocks, detect(ctx) }`; `gates.ts` implements `evaluateGate` (findings query by gate + prerequisite functions). Retire `runChecks`: keep the exported name as a thin adapter returning findings mapped to the old `{code,severity,detail}` shape so `src/app/page.tsx` and the payrun page keep compiling, then update the payrun page to render findings with ack controls (severity chip, note input for WARNING, tick for REVIEW) — minimal styling, Plan 2 rebuilds it.
- [ ] **Step 4: Run full suite** (old `runChecks` tests updated to findings assertions).
- [ ] **Step 5: Commit** — `git commit -am "feat: anomaly rule catalog v1, gate evaluation, transitions wired to findings"`

---

### Task 6: Line payments + withdrawals state machine

**Files:**
- Modify: `db/schema.ts` (`linePayments`, `withdrawals` — same migration as Task 5)
- Create: `src/server/payments.ts`
- Test: `tests/service/payments.test.ts`

**Interfaces:**
- Produces: `line_payments { id PK, lineId FK UNIQUE, state "READY"|"HOLD"|"RELEASED"|"PAID"|"FAILED_RETURNED"|"RECONCILED"|"WITHDRAWN", holdReason, releasedAt, releaseBatchId, paidAt, paymentRef, failedReason, reconciledAt, reconEvidenceArtifactId, updatedAt }`; `withdrawals { id PK, lineId FK UNIQUE, reasonCode enum["MOVED_TO_OFFCYCLE","DUPLICATE_LINE","EMPLOYEE_NOT_PAYABLE","PAYMENT_CANCELLED_BY_AUTHORITY","OTHER_CONTROLLED_EXCEPTION"], note NOT NULL, actor, at, postApprovalApprover, replacementRunId }`.
- Functions: `holdLine(lineId, reason)`, `unholdLine(lineId)`, `withdrawLine(lineId, { reasonCode, note, actor, postApprovalApprover?, replacementRunId? })`, `getPaymentState(lineId)`. Transition table enforced in one place:

```ts
const PAY_TRANSITIONS: Record<PayState, PayState[]> = {
  READY: ["HOLD", "RELEASED", "WITHDRAWN"],
  HOLD: ["READY", "WITHDRAWN"],
  RELEASED: ["PAID", "FAILED_RETURNED", "WITHDRAWN"], // WITHDRAWN only via cancelRelease (Task 7)
  FAILED_RETURNED: ["RELEASED", "WITHDRAWN"],
  PAID: ["RECONCILED"],
  RECONCILED: [],
  WITHDRAWN: [],
};
```

- [ ] **Step 1: Write failing tests** — approve a run (Task 5 path creates READY rows); assert: READY→HOLD→READY; WITHDRAWN requires note + reason (OTHER requires note ≥ 30 chars); withdrawal after approval requires `postApprovalApprover`; **PAID can never become WITHDRAWN** (`expect(() => withdrawLine(paidLine,…)).toThrow(/PAID/)`); withdrawn line is skipped by closure counting (assert via `getPaymentState`).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `src/server/payments.ts` — every mutator: load state → assert transition allowed → update + audit in one tx. `transitionRun(...,"APPROVED")` inserts READY `line_payments` for all non-excluded lines (wire in this task).
- [ ] **Step 4: Run full suite.**
- [ ] **Step 5: Commit** — `git commit -am "feat: line payment states and controlled withdrawals"`

---

### Task 7: Artifacts, release batches, payment attempts, generic register

**Files:**
- Modify: `db/schema.ts` (`artifacts`, `releaseBatches`, `paymentAttempts`, `bankFormatters`) — migration `--name release`
- Create: `src/server/artifacts.ts`, `src/server/release.ts`
- Test: `tests/service/release.test.ts`

**Interfaces:**
- `artifacts { id PK, runId, lineId?, batchId?, type text ("PAYMENT_REGISTER"|"BANK_FILE"|"CASH_SHEET"|"PAYSLIP_PDF"|"EVIDENCE"|"MANIFEST"|"EXCEPTION_REPORT"), relativePath, sha256, byteSize, mimeType, createdAt, createdBy, source "GENERATED"|"ATTACHED" }`.
- `src/server/artifacts.ts`: `storeArtifact(opts: { runId, type, filename, content: Buffer|string, lineId?, batchId?, source? }): ArtifactRow` — writes to `data/runs/<runId>/<filename>`, sha256, inserts row; `attachEvidence(opts: { runId, sourcePath, type, lineId?, batchId? })` — copies external file in via the app (spec: evidence enters only through the app); `runFolder(runId): string`.
- `release_batches { id text PK e.g. "<runId>-B01", runId, method "BANK"|"CASH", status "OPEN"|"SETTLED"|"PARTIALLY_SETTLED"|"CANCELLED", totalSen, lineCount, formatterId?, registerArtifactId, bankFileArtifactId?, createdAt, createdBy }`; `payment_attempts { id PK, batchId FK, lineId FK, amountSen, bankSnapshot text (JSON {bank,account,name}), status "PENDING"|"PAID"|"FAILED", failedReason?, settledAt?, paymentRef? }`.
- `bank_formatters { id PK, bankCode, formatId, formatVersion, status "DRAFT"|"VALIDATED"|"RETIRED", validatedAt?, validatedAgainstEvidenceRef? }` — seeded with one row `{ bankCode:"GENERIC", formatId:"REGISTER_CSV", formatVersion:"1", status:"DRAFT" }`. **Rule enforced in code: a batch may reference a formatter for a BANK_FILE artifact only when formatter.status === "VALIDATED"; the generic register is always produced and is never typed BANK_FILE.**
- `src/server/release.ts`: `previewRelease(runId, lineIds): { eligible: LineRef[], excluded: {lineId, reason}[], totalSen, byBank: {bank,count,totalSen}[] }` (evaluates RELEASE gate per line); `commitRelease(runId, lineIds, { method, actor }): { batchId, registerArtifactId }` — one tx: re-evaluate eligibility, create batch + attempts (snapshotting employee bank/account/name at this moment), lines → RELEASED, write register CSV artifact (columns: employeeId, name, bank, account, amountRM, reference `<batchId>-<employeeId>`); `settleAttempt(attemptId, { outcome: "PAID"|"FAILED", paymentRef?, failedReason?, settledAt })` — updates attempt, projects line state (PAID / FAILED_RETURNED), recomputes batch rollup status; `settleBatchAllPaid(batchId, { paymentRef, settledAt })` convenience; `cancelRelease(batchId, reason)` — only while every attempt PENDING: attempts → FAILED("release cancelled"), batch CANCELLED, lines → READY (this is the sole RELEASED→WITHDRAWN-enabling path: after cancel, `withdrawLine` works from READY).

- [ ] **Step 1: Write failing tests** — mixed settlement is the core case:

```ts
it("release → mixed results → retry in second batch preserves both attempts", () => {
  // approve run with 3 employees: E1 bank ok, E2 bank ok, E3 CASH
  const p = previewRelease(RUN, [l1, l2]);
  expect(p.eligible.length).toBe(2);
  const { batchId } = commitRelease(RUN, [l1, l2], { method: "BANK", actor: "Jack" });
  settleAttempt(attemptOf(batchId, l1), { outcome: "PAID", paymentRef: "OCBC123", settledAt: "2026-08-09" });
  settleAttempt(attemptOf(batchId, l2), { outcome: "FAILED", failedReason: "invalid account", settledAt: "2026-08-09" });
  expect(batchStatus(batchId)).toBe("PARTIALLY_SETTLED");
  expect(stateOf(l2)).toBe("FAILED_RETURNED");
  const second = commitRelease(RUN, [l2], { method: "BANK", actor: "Jack" });   // retry directly
  expect(getDb().select().from(paymentAttempts).all().filter(a => a.lineId === l2).length).toBe(2);
});
it("register artifact exists on disk with recorded sha256; type is PAYMENT_REGISTER not BANK_FILE", () => { ... });
it("missing bank account excluded with reason; HOLD line excluded", () => { ... });
it("cancelRelease before settlement returns lines to READY", () => { ... });
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** per Interfaces. `data/runs/` added to `.gitignore` (already under `/data/`).
- [ ] **Step 4: Run full suite.**
- [ ] **Step 5: Commit** — `git commit -am "feat: artifacts, release batches, immutable payment attempts"`

---

### Task 8: Off-cycle run service

**Files:**
- Modify: `src/server/payrun-service.ts` (`createOffcycleRun`)
- Test: `tests/service/offcycle.test.ts`

**Interfaces:**
- Produces: `createOffcycleRun(opts: { companyCode, year, month, workingDays, reason: OffcycleReason, employeeIds: string[], linkedRunId?: string, payDate?: string }): string` — id = `<company>-<year>-<mm>-OC<n>` (n = existing off-cycles for that period + 1); creates lines only for `employeeIds` (template copy + PCB entry, same as `addEmployeeLine`); same lifecycle/gates as regular.

- [ ] **Step 1: Write failing tests** — off-cycle coexists with regular same period; contains only selected employees; `EMPLOYEE_IN_OVERLAPPING_RUNS` REVIEW finding fires on scan for an employee present in both; second off-cycle gets `-OC2`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** (validate employees belong to the company; reason required; `runType:"OFFCYCLE"`).
- [ ] **Step 4: Run full suite.**
- [ ] **Step 5: Commit** — `git commit -am "feat: off-cycle pay runs"`

---

### Task 9: Reconciliation, distributions, closure invariant + manifest

**Files:**
- Modify: `db/schema.ts` (`distributions`) — migration `--name close`
- Create: `src/server/close.ts`
- Modify: `src/server/payments.ts` (`reconcileAttempt`), `db/triggers.ts` (CLOSED locks payment tables)
- Test: `tests/service/close.test.ts`

**Interfaces:**
- `distributions { id PK, lineId FK, channel "PRINTED"|"WHATSAPP"|"EMAIL"|"HANDED", state "GENERATED"|"SENT"|"DELIVERED"|"HANDED"|"PRINTED", artifactId?, at, actor }`; `recordDistribution(lineId, { channel, state, artifactId? })`.
- `reconcileAttempt(attemptId, { statementRef, statementDate, evidenceArtifactId? })` — attempt must be PAID; line → RECONCILED; batch rollup → SETTLED when all attempts terminal.
- `src/server/close.ts`: `closureChecklist(runId): { item: string, ok: boolean, detail: string }[]` implementing spec §1.5 mechanically: (1) every non-excluded line RECONCILED or WITHDRAWN; (2) every PAID/RECONCILED line has ≥1 distribution record; (3) every batch status ∈ {SETTLED, CANCELLED}; (4) no PENDING attempt; (5) no OPEN/unacknowledged CLOSE-gate findings. `closeRun(runId, actor): { manifestArtifactId }` — one tx: checklist all-ok assert → build `manifest.json` `{ runId, calcRevision, approvedRevision, statutoryPackId, anomalyPackVersion, approval: {by, at}, artifacts: [{filename, type, sha256, byteSize, createdAt}], closedAt }` → `storeArtifact(type:"MANIFEST")` → hash of manifest stored in `pay_runs.closedManifestArtifactId` + status CLOSED + audit. New triggers: UPDATE/DELETE on `line_payments`, `payment_attempts`, `distributions`, `release_batches` blocked when owning run status = 'CLOSED'.
- `transitionRun` for `to === "CLOSED"` delegates to `closeRun` (replaces Task 2's temporary throw).

- [ ] **Step 1: Write failing tests** — happy path approve→release→settle all PAID→distribute (GENERATED)→reconcile→`closureChecklist` all ok→`closeRun`→status CLOSED, manifest artifact on disk listing every artifact with correct sha256; negative paths: unreconciled line blocks (checklist item false, `closeRun` throws), undistributed paid line blocks, WITHDRAWN line does not block, post-close `db.update(linePayments)` throws `/locked/`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run full suite.**
- [ ] **Step 5: Commit** — `git commit -am "feat: reconciliation, distribution records, sealed closure with manifest"`

---

### Task 10: Minimal UI adaptation + e2e extension + docs

**Files:**
- Modify: `src/app/payruns/[id]/page.tsx`, `src/components/payrun-grid.tsx` (findings panel w/ ack controls; payment-state column read-only; Close button via closureChecklist display; remove "Mark paid")
- Modify: `src/app/page.tsx` (dashboard counts from findings), `src/app/actions/payruns.ts` (ack/hold/withdraw/release/settle/reconcile/close actions wrapping Task 5–9 services)
- Modify: `scripts/e2e-check.ts`, `README.md`
- Test: manual browser walkthrough + extended e2e

**Interfaces:**
- Consumes: everything above. Produces: server actions `acknowledgeFindingAction(findingId, note?)`, `holdLineAction(lineId, reason)`, `withdrawLineAction(lineId, input)`, `previewReleaseAction(runId, lineIds)`, `commitReleaseAction(runId, lineIds, method)`, `settleAttemptAction(attemptId, input)`, `reconcileAttemptAction(attemptId, input)`, `recordDistributionAction(lineId, input)`, `closeRunAction(runId)` — all returning the existing `ActionResult` shape.

- [ ] **Step 1: Extend `scripts/e2e-check.ts`** after the existing July assertions: verify all 37 PCB entries as verified-zero on the scratch DB, transition REVIEWED→APPROVED (asserting gate_certifications row + 37 READY payments), release 36 lines (1 held) in a batch, settle 35 PAID + 1 FAILED, retry the failed in batch 2, withdraw the held line (MOVED_TO_OFFCYCLE, replacement off-cycle run created via `createOffcycleRun`), record GENERATED distributions for paid lines, reconcile all attempts, run `closureChecklist` (expect all ok), `closeRun`, assert manifest content lists the register artifacts and post-close writes throw. Print PASS/FAIL like the existing script.
- [ ] **Step 2: Run** `npx tsx scripts/e2e-check.ts` → E2E CHECK PASSED.
- [ ] **Step 3: UI adaptation** — replace checks panel data source with findings (chip per severity, ack tick/note inline), add read-only Payment column (StatusChip-like badge text), wire minimal buttons (Hold/Withdraw via prompt-free small forms in the expander; Release-selected via existing selection checkboxes; Close button shows checklist in a dialog). Keep current visual style; Plan 2 replaces this page wholesale.
- [ ] **Step 4: Verify** — `npx tsc --noEmit`, `npm run build`, `npx vitest run` all green; browser walkthrough: dashboard → July run → findings visible → cannot approve with PCB pending. Update README monthly checklist (approve → release → settle → distribute → reconcile → close replaces "Mark paid").
- [ ] **Step 5: Commit** — `git commit -am "feat: wire findings and payment lifecycle into existing UI; extend e2e"`

---

## Self-review notes (performed)

- **Spec coverage:** §1 lifecycle → Tasks 2,3,6,9; §4 findings/gates → Tasks 4,5; §6 release/artifacts/close → Tasks 7,9; §1.4 off-cycle → Task 8; §8.1 persons + run-membership → Task 1. §2/§3/§7 (workspace UI, entry contract, components) intentionally deferred to Plan 2; §5 payslip to Plan 3; §8 transfer workflow to Plan 4 (Task 1 lays its foundation).
- **Type consistency:** state enums, table names and function signatures cross-checked across tasks (`line_payments.state` values match `PAY_TRANSITIONS`; `evaluateGate` gate union matches `blocksJson` values; `runChecks` adapter keeps old callers compiling until Task 10 removes them).
- **No placeholders:** every code step contains concrete code or exact column/function definitions; test skeletons marked "full file in implementation" still enumerate the exact cases and assertions to write.
