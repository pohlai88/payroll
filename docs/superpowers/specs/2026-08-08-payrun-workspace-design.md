# Pay-Run Workspace, Teaching Payslip & Payment Lifecycle — Design Spec

**Date:** 2026-08-08 · **Status:** Frozen (Sections 1–7 approved) · **Approach:** B — run-workspace-centric upgrade

## Context

The DLB Payroll app (local Next.js 16 + SQLite, C:\JackProject\payroll) replaced two drifting Google Sheets. The calculation engine is verified by a golden-master test reproducing the July 2026 run to the sen. This design upgrades the *operational* layer around that engine:

1. The pay-run page becomes the single operational cockpit — a normal monthly payroll completes without leaving it.
2. The payslip becomes a teaching document: every number answers "why".
3. Payment becomes employee-level truth (hold/release/settle/reconcile individually), with off-cycle runs for exceptions.
4. An abnormality engine challenges unusual facts before money moves.
5. Outputs (bank file, payslip PDFs, reports, evidence) are produced inside the workspace and sealed at closure.

**Out of scope (explicit):** redesign of Companies/Employees/Import/Settings beyond shared-component swaps; any change to the verified calculation engine except additive trace metadata (§5.4); turning the stepper into pages; making every anomaly a hard error.

**Architecture hierarchy (frozen):** Calculation engine determines payroll → revision certification proves what was reviewed/approved → findings challenge unusual facts → gate prerequisites enforce process completion → line-level state tells the payment truth → the workspace keeps the operator in one place → the teaching payslip explains the result → artifacts preserve what was released/distributed → reconciliation proves settlement → closure seals facts and evidence together.

---

## 1. Lifecycle & state model

### 1.1 Run status (explicit, four values)

```
DRAFT → REVIEWED → APPROVED → CLOSED
```

- **DRAFT** — calculation/input may change.
- **REVIEWED** — the *latest calculation revision* has passed required review gates.
- **APPROVED** — calculation authorized and frozen (existing DB lock triggers).
- **CLOSED** — all downstream payment/distribution obligations disposed of; run fully immutable (lock triggers extend to payment/distribution tables).

Payment/distribution/reconciliation stages between APPROVED and CLOSED are **line-level rollups**, not run statuses. The stepper displays them as progress ("Paid 35/37").

### 1.2 Calculation revision certification

- `calcRevision` = hash over **canonical calculation-relevant state only**: employee payroll snapshots, run/calendar parameters, calculation inputs, variable items, statutory inputs (PCB/CP38/zakat), approved overrides, statutory rule-pack id, anomaly rule-pack version, relevant company payroll config. Excluded: UI state, notes not affecting calculation, payment/distribution state, acknowledgment notes, generation timestamps.
- Canonical serialization: deterministic ordering, normalized decimals/dates, no key-order dependence.
- REVIEWED and APPROVED each store the revision they certify → provable "what was reviewed = what was approved", assessed under recorded rule-pack versions.
- Any calc-affecting change while REVIEWED: **one transaction** = confirm-dialog → demote to DRAFT → invalidate review certification → apply edit → recompute → re-evaluate findings → new revision → audit both. No state where the edit persisted but the run stayed REVIEWED.

### 1.3 Line payment state (`line_payments`, projection; `payment_attempts`, truth)

```
READY ⇄ HOLD(reason)
READY → RELEASED(batch) → PAID(date, ref) → RECONCILED(evidence)
RELEASED → FAILED_RETURNED(reason) → (next release directly from FAILED_RETURNED)
READY/HOLD → WITHDRAWN
RELEASED → WITHDRAWN only if the release is formally cancelled before settlement
PAID ✕→ WITHDRAWN (never)
```

- `line_payments` is created at approval (state READY) and is the convenient current-state projection.
- **`payment_attempts` is the immutable settlement history**: one row per line per release batch, snapshotting bank/account/name as released; statuses PENDING → PAID / FAILED. An employee can have Batch A rejected, corrected details, Batch B paid — both preserved.
- **WITHDRAWN** = "intentionally removed from the settlement obligation of this specific run". Requires: reason code (`MOVED_TO_OFFCYCLE` · `DUPLICATE_LINE` · `EMPLOYEE_NOT_PAYABLE` · `PAYMENT_CANCELLED_BY_AUTHORITY` · `OTHER_CONTROLLED_EXCEPTION`), mandatory note (stronger narrative for OTHER), actor + timestamp, approval when withdrawal happens after run approval, optional `replacementRunId`.

### 1.4 Off-cycle runs

`pay_runs` gains `runType` (REGULAR / OFFCYCLE), `offcycleReason` (CORRECTION / ARREARS / BONUS / MISSED_PAYMENT / FINAL_PAYMENT), optional `linkedRunId`. Uniqueness of (company, year, month) applies to REGULAR only; off-cycle ids: `DLBB-2026-07-OC1`. Off-cycle runs contain only selected employees, follow the identical lifecycle and gates, and are badged (violet) everywhere.

### 1.5 Closure invariant (mechanical)

A run may close only when:
- every included line has a terminal disposition (**RECONCILED or WITHDRAWN**);
- every PAID/RECONCILED line requiring a payslip has distribution evidence;
- all release batches have terminal status; no pending payment attempt exists;
- no unresolved CLOSE-gate findings and all CLOSE prerequisites satisfied;
- the closure manifest (§6.6) is generated and hashed into the run record.

---

## 2. Workspace anatomy (`/payruns/[id]`)

Four regions; no region navigates away. **Interaction grammar (frozen): stepper changes the lens · grid does the work · rail tells you what remains · sheet handles the employee · dialog protects consequential actions.**

### 2.1 Header + stepper

Eight stages: Inputs → PCB/Statutory → Abnormality Scan → Review → Approval → Payment → Distribution → Reconcile & Close. Clicking a stage sets **`activeStage`** (a lens: column preset + grid filter + rail content) — fully independent of **`workflowState`** (what the run has earned). Stages ahead of workflowState render preview/read-only/gated with the reason on hover. Header shows run identity, type badge, current `calcRevision`, bound reviewed/approved revisions, and a demotion banner when auto-demotion fired. Stages show live rollups.

### 2.2 Grid (working surface)

- One row per employee. **Stable identity columns in every preset:** `Employee · status/finding marker · Net Pay` (sticky); stage-specific columns expand around them.
- Column presets per stage (Inputs / PCB / Scan-Review / Pay / Distribute-Reconcile).
- **Escape hatch in every stage:** `All employees · Exceptions only · Current selection`; rail counts click through to the exact rows.
- Row markers: amber = changed since last reviewed revision (tooltip: field-level old → new from audit log); severity badge = open findings; lock = calc frozen.

### 2.3 Context rail (operational, not informational)

Rule: anything shown as incomplete has an immediate action or a direct route to the exact row/field that resolves it ("PCB 35/37 → click → filters to the 2 incomplete"). Contains stage checklist, findings queue with inline dispositions, stage actions, audit tail. Rail *initiates* consequential actions; the transaction itself always passes through a dialog (§7.3).

### 2.4 Slide-over sheet (employee drill-down)

Tabs: Inputs · Calculation (trace) · PCB · Payslip (live preview, single PDF) · Payment (state actions, attempt history, evidence). Two widths: `standard` (~560px) and `focus` (~75vw). Pinnable; prev/next walks employees — the "process one at a time" mode with zero navigation.

### 2.5 Selection model

`Visible` (filter result) ≠ `Selected` (explicit choice) ≠ `Eligible` (selected ∧ passes the action's rules). Low-risk bulk input edits may act on *visible* rows via explicit confirm; high-risk operations (approve, release, withdraw, settle) require explicit *selection* and show `n selected · m eligible · k excluded (reasons)` before commit. Accidental filtering is never authorization.

---

## 3. Grid data-entry contract

### 3.1 Editability

DRAFT: inputs editable. REVIEWED: editable via the atomic demote transaction (§1.2). APPROVED+: calc inputs hard-locked; payment/distribution surfaces live. WITHDRAWN lines grey/read-only. PCB fields are calc inputs.

### 3.2 Commit pipeline

Cell commit → single server action: validate → persist → recompute line → re-evaluate line-scoped findings → recompute rollups + `calcRevision` → response contains row values, findings, counters, hash **from one transaction** (one coherent revision; no independently racing refreshes). Success tick / revert + red + human-sentence toast on failure. Synchronous recompute (better-sqlite3, ≤100 rows).

### 3.3 Validation layers (frozen principle: *impossible data is rejected; unusual data is preserved and challenged*)

1. **Format** (client): representation only. Negative values allowed per field schema (`allowNegative`), not globally rejected — signed adjustment fields are legitimate.
2. **Domain-impossible** (server): rejected, never persisted (paid days > working days, meal days > working days, negative rate fields).
3. **Suspicious-but-possible** (findings engine): persisted then flagged (OT > 72h, zero paid days, meal ≠ paid days).

### 3.4 Keyboard & bulk

Arrows/Tab/Enter/F2/Esc/Home/End per §7 keyboard model; Space toggles selection. Bulk: fill-down over selection; set-column over visible (confirm w/ row count); TSV paste via mapping-preview dialog (old → new per cell, fix-or-exclude, one transactional apply — never partial-silent). **Every bulk operation carries a `bulkOperationId`** parent audit event ("Excel paste — 30 employees · 184 fields · Jack · 10:03") with field-level children.

---

## 4. Abnormality engine & gates

### 4.1 Findings

Key: `(runId, lineId?, ruleId, fingerprint)` — fingerprint hashes **material evidence only** (e.g. current net, baseline net, variance, baseline run id), human-readable, not implementation internals. Upsert on re-scan. Lifecycle: `OPEN → ACKNOWLEDGED → auto-RESOLVED` with `resolvedAt`, `resolvedRevision`, `resolutionType=CONDITION_CLEARED`, prior evidence snapshot. **Acknowledgment binds to evidence**: same rule + changed fingerprint → prior ack archived to history, finding reopens. Cross-run rules persist baseline provenance (`baselineRunId`, `baselineLineId`, baseline/current values) — the comparison actually made, never recomputed later. All findings record the detection `calcRevision` and `anomalyRulePackVersion` (v1: `MY-PAYROLL-ANOMALY-V1`, code-owned constants; no settings UI).

### 4.2 Severity × gate scope (independent dimensions)

Severity (how serious): `INFO` (no action) · `REVIEW` (acknowledge — actor/time/fingerprint/revision recorded, no note) · `WARNING` (acknowledge + note) · `BLOCKING` (fix only; cannot acknowledge). Gate scope (what it prevents): `blocks ⊆ {REVIEW, APPROVAL, RELEASE, CLOSE}`.

**Findings ≠ gate prerequisites.** Routine incomplete workflow states are *prerequisites*, evaluated by the same gate engine but not written to the findings/exception report. Exception report = findings + dispositions only. Prerequisites v1 by gate — REVIEW: every included line has its basis inputs entered (paid days for MONTHLY/DAILY, hours for HOURLY) and a non-zero base rate; APPROVAL: run is REVIEWED at the current calcRevision; RELEASE: run APPROVED, line READY/FAILED_RETURNED; CLOSE: the §1.5 invariant items (terminal dispositions, distribution done per channel, batches terminal, no pending attempts).

### 4.3 Rule catalog v1 (atomic rule ids; thresholds = named constants)

| Rule id | Trigger | Severity | Gates |
|---|---|---|---|
| NET_VARIANCE_VS_PRIOR | \|Δnet\| > RM300 **AND** > 20% vs baseline (materiality combination) | WARNING | APPROVAL |
| NET_ZERO | net = 0 | WARNING | APPROVAL |
| NET_NEGATIVE | net < 0 | BLOCKING | APPROVAL |
| PCB_UNVERIFIED | PCB applicable, entry unverified/absent | BLOCKING | APPROVAL |
| EIS_AGE_HISTORY_UNRESOLVED | 57+, prior-contribution unknown | BLOCKING | APPROVAL |
| STATUTORY_STEP_SHIFT | EPF/SOCSO/EIS moved >1 band step, wages similar | REVIEW | APPROVAL |
| STATUTORY_ZERO_WITH_WAGES | applicable scheme, wages > 0, contribution 0 | WARNING | APPROVAL |
| EMPLOYEE_OMITTED | in baseline run, ACTIVE, absent here | WARNING | APPROVAL |
| EMPLOYEE_IN_OVERLAPPING_RUNS | regular + off-cycle same period | REVIEW | APPROVAL |
| OT_OUTLIER | OT > 72h or OT pay > 50% basic (anomaly threshold, not a legal claim) | WARNING | APPROVAL |
| VARIABLE_ITEM_SPIKE | ad-hoc item above RM constant | REVIEW | APPROVAL |
| NEW_EMPLOYEE | first payroll in app | INFO | — |
| MISSING_STATUTORY_NO | EPF/SOCSO no. or TIN absent while applicable | REVIEW | APPROVAL |
| BANK_DETAILS_MISSING | BANK method, no/invalid account | BLOCKING | RELEASE |
| BANK_DETAILS_CHANGED | account new/changed since last paid run | REVIEW | RELEASE |

Baseline = company's most recent prior REGULAR run; variance rules silent when none exists. Existing `runChecks` hard checks fold into this engine — one gate mechanism, one audit vocabulary. Engine runs: line-scoped rules in the commit transaction; run-scoped on load, on demand, and always inside gate transitions (gates never trust cached scans). RELEASE gate evaluates per line against the selection (feeds eligible/excluded in the release dialog).

---

## 5. Teaching payslip

### 5.1 Document model

**Payslip PDF = Page 1 (financial statement) + Page 2 (calculation & reference annex). One document: same document id (`runId · employeeId · calcRevision`), same archived hash.** Page 1 answers *what happened to my pay*; Page 2 answers *why each number happened*.

**Page 1:** employer identity + registrations; employee identity (IC masked) + statutory numbers; pay-basis statement ("Monthly RM3,500.00 — paid 24 of 26 working days / Bulanan…"); EARNINGS and YOUR DEDUCTIONS tables with columns `Item (EN/BM) · How calculated (compact) · This month · YTD`; SKBBK on its own line (employee-funded supplement); PCB line shows source + evidence ref + VERIFIED; **EMPLOYER PAYS FOR YOU / CARUMAN MAJIKAN** box (EPF/SOCSO/EIS ER, HRDF; total cost of employment) visually separated from deductions; gross/net; approval/document identity; concise reference codes.

**Page 2 (annex):** bilingual plain-language narrative (pay basis & proration, OT derivation, statutory band/category explanation incl. age-derived part/category, PCB provenance, net arithmetic); full [S1]–[S4]/[L1]–[L2] references with effective dates; rule-pack + anomaly-pack versions; YTD/transition provenance.

### 5.2 Renderer consumes trace only

The PDF layer never recalculates. It renders persisted trace entries. Trace entries are typed:
`CALCULATION` (formula + operands + result) · `TABLE_LOOKUP` (wage → band → amount; never faked as a percentage) · `EXTERNAL_VERIFIED` (PCB: amount, source, verified date, evidence ref) · `MANUAL_ADJUSTMENT` (override: computed vs applied, reason, approver).

### 5.3 YTD

`Displayed YTD = verified opening balance + lines from runs at APPROVED or CLOSED through this payslip's period, this line exactly once` — computed from payroll lines, never from generated payslips; the two components visibly distinguished on the annex. This YTD is **per employment (employee ID + company)** — it is the `employerYtd` of §8.4; cross-company transfer history never merges into it (see §8 for `priorEmployerYtd` and the annex-only tax-basis presentation). `ytd_openings`: per employee/company/year with **full component set** (gross, remuneration base, EPF EE/ER, SOCSO EE/ER, EIS EE/ER, PCB, CP38, zakat, net, HRDF ER), `asOfPeriod`, `sourceSystem`, `sourceEvidenceRef`, enteredBy/verifiedBy + timestamps, status `OPENING_PENDING → VERIFIED`. Mandatory for migrated employees with prior-year payroll; while pending, payslip prints "YTD incomplete — prior payroll opening balance pending verification". No opening applicable → label "YTD since Jul 2026". After an opening has fed an approved payslip, edits require a controlled correction (audited, flags affected YTD reporting).

### 5.4 Engine impact (only permitted change)

Additive: trace entries gain `kind` + structured operands/band fields. Golden master must remain green unchanged.

---

## 6. Approval → release → distribution → reconciliation → close

### 6.1 Approval (AuthorizationDialog)

Certifies: calc revision, statutory + anomaly rule-pack versions, totals, findings disposition summary, operator stamp. One transaction: gate evaluation → APPROVED → calc lock → `line_payments` READY per non-withdrawn line.

### 6.2 Release

`GENERIC_PAYMENT_REGISTER → BANK_FORMATTER → BANK_UPLOAD_FILE`. The generic register CSV is a review/export artifact and is **never labelled a bank upload file**. Formatter registry: `bankCode, formatId, formatVersion, validatedAt, validatedAgainstEvidenceRef, status DRAFT|VALIDATED|RETIRED` — **no formatter goes LIVE until validated against a bank-provided sample/spec and a controlled test upload** (OCBC Velocity spec to be obtained from Jack's portal). Formatter identity is stamped into each batch.

Flow: selection → release dialog (eligible/excluded per RELEASE gate; count, net settlement, per-bank subtotals, exclusions with reasons) → *Preview → validate totals → confirm* — generation for preview never implies release; the dialog confirm is the authority boundary → immutable `release_batches` row (id, method BANK/CASH, totals, file artifact + SHA-256, formatter identity) + `payment_attempts` per line (bank snapshot as released) + lines → RELEASED. CASH batches produce the signature sheet; the signed/scanned sheet is their settlement evidence.

### 6.3 Settlement

Attempt-level truth; batch status is a rollup. "Mark all successful" is a convenience path only — mixed results (A PAID, B FAILED, C PENDING) are first-class. Failure: attempt FAILED + reason → line FAILED_RETURNED; next batch may include it directly.

### 6.4 Distribution

Batch PDFs via `puppeteer-core` + installed Edge (`channel: "msedge"`, no Chromium download) rendering the two-page payslip per employee into the run folder; fallback = existing combined batch-print route. `distributions` per line record **honest channel semantics**: `GENERATED · SENT · DELIVERED (only where knowable) · HANDED · PRINTED` — CLOSE requires *distribution action completed per chosen channel*, never pretending receipt-proof. Each PDF is an artifact (hashed).

### 6.5 Artifacts & evidence

`artifacts` table: `artifactId, runId, lineId?, batchId?, type, relativePath, sha256, byteSize, mimeType, createdAt, createdBy, source|generated`. All references (distributions, batches, reconciliation, openings evidence) point at `artifactId`, never raw paths. Run folder `data/runs/<runId>/` holds the files (bank files, cash sheets, payslip PDFs, exception report, register, statutory summaries, reconciliation evidence); "Open run folder" in the rail. **Evidence enters only through the app** (attach → copy → hash → artifact record); files manually dropped in the folder are unregistered until imported. Storage principle: *database owns facts; artifact store owns files; hashes bind them; closure seals both.*

### 6.6 Reconciliation & close

Per batch: statement date/ref + optional evidence artifact → attempts RECONCILED → lines RECONCILED. **Close dialog** renders the §1.5 invariant as a live checklist; on confirm: generate `manifest.json` (run id, calc revision, rule packs, approval identity, full artifact inventory w/ hashes/sizes/timestamps, closure timestamp), hash the manifest into the closed run record, extend immutability to payment/distribution tables. The run folder + DB rows form the portable audit pack.

---

## 7. Component system & interaction states

### 7.1 Shared layer (`src/components/system/`)

`MoneyText`/`MoneyInput` (sen-backed, tabular-nums, `allowNegative` per field schema — the only money renderers); `StatusChip` (one visual grammar — neutral/blue/amber/green/red/violet, icon + label, never color-only — mapping **separate domain enums**: `RunStatus`, `PaymentState`, `FindingSeverity`, `DistributionState`, `RunType`; shared presentation grammar, separate domain semantics); `ConfirmDialog` + `AuthorizationDialog`; `WorkSheet` (standard/focus, pinnable, prev/next); `FindingCard`; `RunGrid` (custom on table primitives, no grid library). Other pages adopt these as swaps only. Every `prompt()`/`confirm()` is eliminated.

### 7.2 Dialog friction, graded

- Checkbox ("I understand…") **only** for irreversible/materially exceptional: `CLOSE RUN`, `WITHDRAW EMPLOYEE`, `APPROVE PAYROLL`.
- Consequential-but-routine (release, settle): consequence summary + action-specific button ("Release RM 127,430.18 to 29 employees"). Meaningful friction, not ceremony.

### 7.3 States, errors, coherence

Async controls: idle → in-place pending → success tick / persistent error (human sentence from `ActionResult`; never traces). Workspace = one coherent snapshot per revision; mutations replace it wholesale. Skeletons on load; empty states name the next action.

### 7.4 Responsive & print

Desktop-first 1280+; sticky identity columns + horizontal scroll; sheet full-screen < ~1024. Print CSS only on payslip/output routes.

### 7.5 Accessibility (release criterion, tested)

Keyboard-complete (roving tabindex grid, focus-trapped dialogs, focus restoration), visible focus rings, AA contrast both themes, accessible names on icon-only controls, no color-only meaning. **Scripted checks:** keyboard-only traversal of the core run workflow; focus restoration from dialog/sheet; no unreachable editable cell; accessible-name audit; axe-style automated pass on workspace + payslip preview.

---

## 8. Internal company transfer (cross-company employment capability)

### 8.1 Person / employment model

- New **`persons`** table: person identity (name, IC/passport, DOB, nationality, `groupServiceDate` = first joining date within the group). The existing `employees` table becomes the **employment record**: one person → many employments; `employees.personId` FK; `employees.joinDate` is the `legalEmploymentStartDate` with that legal employer. Employee IDs remain the payroll-facing identifiers.
- Migration backfill: create persons from existing employees, linking records that share an IC; same-IC multi-employment links surface as INFO findings for review. Employments without IC get their own person until manually linked.
- **One person, multiple employment records; legal employer boundaries stay explicit.**

### 8.2 Same-company department transfer

A normal employment change, not a transfer: same employment record, company payroll YTD untouched. Department, position/designation, cost centre, reporting line change with an **effective date** through a new `employment_changes` history table (field, old, new, effectiveDate, actor, evidenceRef) — the audit history of the employment. Executed from the employee page via a dialog; server-authoritative and audited like every other mutation.

### 8.3 Cross-company transfer semantics

- Employment A is **ended** at `effectiveDate − 1` with termination reason `INTERNAL_GROUP_TRANSFER` (status → INACTIVE at that date).
- Employment B is **created** under the receiving legal employer (new employee ID, company B registrations, salary/pay basis/designation per the transfer), `joinDate = effectiveDate`, same `personId`.
- A **`transfers`** record links both: `transferId, personId, fromEmploymentId, toEmploymentId, effectiveDate, status DRAFT → COMMITTED, groupServiceContinuity (CONTINUOUS | RESET + reason), leaveBenefitTreatment note, finalPayRunId?, commencementRunId?, letters/evidence artifactIds, actor, timestamps`. Employment B stores `priorEmploymentId`. The final-pay and commencement runs backlink to the transfer so the findings in §8.6 evaluate against explicit references, never inference.
- COMMIT is one transaction (end A, create B, link) — never partial. Post-commit completion items (final pay, commencement pay, tax data) are tracked by findings/prerequisites (§8.6), not by silent state.

### 8.4 Service dates & YTD separation

- `persons.groupServiceDate` — original first joining date in the group (continuity per transfer decision). **Not calculation-relevant; excluded from `calcRevision`.**
- `employees.joinDate` — legal employment start with the current employer; drives commencement proration via the existing inputs (no engine change).
- **`employerYtd`** = §5.3 YTD, naturally scoped to the employment (employee ID + company): Company B YTD starts at zero.
- **`priorEmployerYtd`** — new `prior_employment_ytd` table attached to the *transfer* (per receiving employment, per year): the prior-employer remuneration/EPF/SOCSO/EIS/PCB/zakat values needed for Malaysian tax continuity (TP3-style data for the PCB process). Entered/verified like `ytd_openings` (source, evidence, verifiedBy, status — Company A's final payslip is the natural evidence artifact) but is a **separate concept and table** — `ytd_openings` remains migration-only (same employer, old system → Afenda) and must not be reused for transfers. Like openings, once a `prior_employment_ytd` record has fed a distributed payslip annex or a verified PCB, edits require the controlled correction workflow.
- **`calendarYearTaxBasis`** — a *presented combination* (employerYtd + priorEmployerYtd) computed for display/annex and for the human PCB workflow only where Malaysian PCB rules require it. It is never stored as wages, never merged into employer YTD, and never enters the calculation engine (PCB remains EXTERNAL_VERIFIED).

### 8.5 Transfer workflow (wizard, from the employee page)

Steps: receiving company → effective date → new department/designation/reporting line → salary & pay basis → group-service continuity treatment → outstanding leave/benefit treatment (recorded as notes/amounts feeding final pay) → **payroll cutoff validation** (see invalid states) → plan final payroll under A (regular run if period open, else off-cycle `FINAL_PAYMENT` linked to the transfer) → plan commencement payroll under B (prorated from effectiveDate) → statutory/tax carry-forward entry (`prior_employment_ytd`) → transfer letters/evidence attached as artifacts → COMMIT (AuthorizationDialog with checkbox — irreversible class). Every step server-validated; full audit trail.

### 8.6 Invalid states & gates

Domain-impossible (rejected): overlapping active employments for one person without an explicit `allowOverlap` + reason on the transfer; effectiveDate inside a period already covered by an APPROVED/CLOSED Company A regular run (transfer cannot silently move approved payroll — user must choose a later effective date or handle via off-cycle correction); `groupServiceDate > legalEmploymentStartDate`.

New findings (same engine, atomic rule ids):

| Rule id | Trigger | Severity | Gates |
|---|---|---|---|
| TRANSFER_OVERLAP_DATES | Employment A end ≥ Employment B start for linked transfer | BLOCKING | APPROVAL |
| PERSON_IN_BOTH_EMPLOYERS | person in two employers' regular runs, same payable period, **no** linked transfer explaining it | WARNING | APPROVAL |
| TRANSFER_FINAL_PAY_MISSING | Company B commencement run in approval while Employment A has no final payroll (regular or FINAL_PAYMENT off-cycle) covering its last period | WARNING | APPROVAL |
| TRANSFER_PRIOR_TAX_MISSING | transferred employee, PCB applicable, same calendar year, `prior_employment_ytd` absent/unverified | REVIEW | APPROVAL |
| SERVICE_DATES_INCONSISTENT | continuity = CONTINUOUS but dates conflict with linked employments | REVIEW | APPROVAL |
| RECEIVING_REGISTRATION_INVALID | Company B run line whose employment lacks required statutory identifiers for company B schemes | REVIEW | APPROVAL |

Runs are company-scoped, so receiving-company payroll automatically uses Company B statutory/employer registrations; the rule above guards the employment-level identifiers.

**Run-membership rule (amended by this capability).** Run creation includes an employment when its period overlaps the run: `joinDate ≤ periodEnd AND (terminationDate IS NULL OR terminationDate ≥ periodStart)` — not the raw ACTIVE flag. Otherwise an employment ended mid-month by a transfer would silently drop out of its own final-month run if the run is created after the termination date. `EMPLOYEE_OMITTED` (§4.3) adopts the same overlap test in place of "ACTIVE".

### 8.7 Payslip behaviour

Company A final payslip: Company A YTD only. Company B payslips: Company B YTD (employerYtd) only. Prior-employer values may appear solely in a **clearly separated "Prior employment this year (tax information)" block on the Page-2 annex** — never presented as wages paid by Company B. Where the verified PCB used a combined tax basis, the annex's `EXTERNAL_VERIFIED` explanation states it ("PCB computed via e-PCB including prior-employer remuneration per attached TP3 evidence").

### 8.8 Design-principle conformance

Engine untouched (proration uses existing inputs; prior-employer data never enters calculation; PCB stays a verified external input). All transfer actions server-authoritative, audited, evidence-backed via `artifacts`.

---

## 9. Schema changes (summary)

New tables: `line_payments`, `payment_attempts`, `release_batches`, `bank_formatters`, `distributions`, `artifacts`, `anomaly_findings` (+ ack/resolution history rows), `gate_certifications` (run, gate, calcRevision, rulePackVersions, actor, at), `ytd_openings`, `withdrawals` (own table: lineId, reasonCode, note, actor, at, postApprovalApprover?, replacementRunId?), `bulk_operations`, `persons`, `employment_changes`, `transfers`, `prior_employment_ytd`.
Modified: `pay_runs` (+ runType, offcycleReason, linkedRunId, calcRevision, closedManifestArtifactId; status enum gains CLOSED). `employees` (+ personId FK, terminationReason incl. `INTERNAL_GROUP_TRANSFER`, priorEmploymentId). Migration: any legacy PAID run becomes CLOSED with `legacyClosed = 1` (manifest not required for legacy); persons backfilled from employees by IC match (same-IC links surfaced as INFO findings). Partial-unique index on regular runs; trace format v2 (typed entries). Existing lock triggers extend to CLOSED scope. Existing `runChecks` retired into the findings engine.

## 10. Verification

- Golden master + all 84 existing tests stay green throughout (engine untouched except trace metadata).
- New unit suites: line-payment and withdrawal state machines (incl. PAID ✕→ WITHDRAWN), findings lifecycle (fingerprint rebind, ack invalidation, auto-resolution records), gate evaluation per scope, closure invariant, YTD arithmetic incl. openings + exactly-once, calcRevision canonicalization (order-independence, exclusion list).
- Headless e2e extends to: approve → release (mixed results) → retry → distribute → reconcile → close, asserting manifest contents and immutability post-close.
- Transfer suite: same-company change preserves YTD and employment record; cross-company COMMIT atomicity (end A + create B + link, or nothing); overlap/domain-impossible rejections; Company B YTD starts at zero; `prior_employment_ytd` never sums into employerYtd; final-pay and prior-tax findings fire; persons backfill idempotent.
- Accessibility scripted checks per §7.5.
- Browser walkthrough of the workspace per milestone; bank formatter goes LIVE only after validation against the real Velocity sample + controlled test upload.
