TASK: AFENDA-PAYSLIP-01 — Production Payslip + Calculation/Audit Annex

Implement the Afenda Malaysia payslip as a production document vertical.

DO NOT redesign the payroll engine.
DO NOT create a second payroll calculator inside the document layer.
The payslip must be a deterministic projection of approved payroll facts.

Before editing:
1. Inspect the repository architecture and existing payroll/document packages.
2. Read the document palette authority:
   - straits-document-palette.json
   - its README.md / document doctrine
3. Locate the canonical payroll result/read model, employee/legal-employer records,
   statutory calculation evidence, pay-run approval state, rule-pack/source-snapshot
   identity, and existing document/PDF infrastructure.
4. Reuse existing contracts/components where they exist.
5. Report any missing canonical data before inventing new persistence or duplicated logic.

============================================================
OBJECTIVE
============================================================

Create an employee-facing Malaysia payslip that answers:

1. Who legally employed me?
2. What period am I being paid for?
3. What did I earn?
4. What was deducted?
5. What did my employer contribute separately?
6. How was each important amount determined?
7. Why is my net pay this amount?
8. Were there corrections or prior-period adjustments?
9. What are my current-period and YTD figures?
10. Which payroll run, rule pack, statutory source snapshot and audit record
    produced this document?

The document must remain understandable years later without requiring access
to the application.

Core doctrine:

RESULT
→ ARITHMETIC
→ STATUTORY BASIS
→ SOURCE
→ EXCEPTION / RECTIFICATION
→ APPROVAL
→ AUDIT IDENTITY

Legal basis for *why* each employee-facing field exists (EPF Act 1991 s.42 /
KWSP wage-statement list, ITA Form EA, and corrections to common EA 1955
myths) is recorded in
[payslip-legal-requirements.md](./payslip-legal-requirements.md). Do not cite
Employment Act 1955 s.19 / s.25A as an itemised-payslip content statute.

============================================================
ARCHITECTURAL RULES
============================================================

1. Payroll engine owns calculations.
2. Payslip/document layer owns presentation only.
3. Never recompute EPF, SOCSO, EIS, PCB, CP38, overtime, proration or net pay
   independently in the document template if canonical calculated values exist.
4. Where formulas are displayed for transparency, they explain the canonical
   calculation; they are not a second source of truth.
5. Legal employer must come from the canonical company/legal-employer registry.
6. Department/cost centre must never substitute for legal employer.
7. Employer contributions are NOT employee deductions.
8. EPF, SOCSO, EIS, PCB, CP38 and ordinary deductions render in neutral ink.
9. Destructive/red styling is reserved for an actual exception, invalid document,
   cancellation, supersession or control failure.
10. Current legal-employer YTD and prior-employer YTD must remain distinct.
    Never silently combine statutory YTD across different legal employers.
11. If a group-level informational YTD is ever displayed, label it explicitly
    NON-STATUTORY / INFORMATIONAL.
12. Generate documents only from an appropriate payroll state according to
    existing approval/release authority.
13. Reprints must remain traceable to the same approved payroll facts and retain
    document/reprint identity.
14. No mutable current master-data lookup may silently alter a historical payslip.
    Historical rendering must use the payroll/run snapshot or equivalent
    immutable facts already established by the architecture.

============================================================
DOCUMENT COLOUR / PRINT AUTHORITY
============================================================

The document consumes ONLY the --doc-* document namespace sourced from
straits-document-palette.json.

Do not use application theme colours.
Do not hardcode raw hex values inside document components/templates.

Required principles:

- light-only document
- white paper
- monochrome-safe
- print-safe
- screen_reference colours never used for print documents
- document fills never reused for application chrome
- amounts use neutral document ink
- tabular numbers
- right-aligned money columns
- nil amount = em dash "—"
- no green net-pay box
- no red deduction amounts
- DRAFT / VOID / SPECIMEN watermarks use disabled ink, not red
- cancelled/superseded document additionally carries clear textual status/glyph

Grand total / Net Pay:
- no fill
- 1pt --doc-rule-total above
- strong/double rule below
- bold neutral --doc-ink

Print CSS must:
- force light mode under :root and .dark
- set color-scheme: light
- force white html/body
- preserve print colours
- prevent important rows/sections from splitting
- repeat thead/tfoot where appropriate
- hide all application chrome/buttons/navigation/toasts

Required baseline:

body {
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}

table,
figure,
[data-print-keep],
[data-evidence-block] {
  break-inside: avoid;
}

h1,
h2,
h3,
h4,
[data-group-header] {
  break-after: avoid;
}

tr {
  break-inside: avoid;
}

thead {
  display: table-header-group;
}

tfoot {
  display: table-footer-group;
}

============================================================
PAGE 1 — EMPLOYEE PAYSLIP
============================================================

Design a professional A4 Malaysia payslip.

SECTION 1 — DOCUMENT + LEGAL EMPLOYER IDENTITY

Show:
- PAYSLIP / PENYATA GAJI
- legal employer name
- company registration number
- company code where useful
- employer EPF reference
- SOCSO / EIS employer reference
- LHDN employer reference
- payroll period
- pay date
- currency
- payroll run ID
- payslip/document ID

Do not expose sensitive internal IDs unnecessarily.

SECTION 2 — EMPLOYEE & PAYMENT SUMMARY

Show where available:
- employee name
- employee ID
- designation
- department / cost centre
- masked NRIC/passport
- masked bank account
- EPF number
- SOCSO number
- employment/pay basis
- working days
- payable/paid days
- relevant attendance basis

PII must follow existing privacy/masking doctrine.

SECTION 3 — STATUTORY WAGE BASES

Clearly expose, where applicable:

EPF Wage
SOCSO Wage
EIS Wage

Add a small explanatory note:

"Statutory contribution wage may differ from gross pay according to the
applicable statutory treatment."

Do not imply gross pay = statutory wage base.

SECTION 4 — PAY RESULT

This should be the strongest arithmetic statement:

GROSS PAY
RM xx,xxx.xx

        −

TOTAL EMPLOYEE DEDUCTIONS
RM x,xxx.xx

        =

NET PAY / GAJI BERSIH
RM xx,xxx.xx

Net pay is a conclusion, not a success state.

SECTION 5 — PAYROLL BREAKDOWN

A. EARNINGS / PENDAPATAN

Support canonical earning lines such as:
- basic / prorated basic
- attendance allowance
- performance allowance
- meal allowance
- additional duty
- petrol
- parking
- incentive
- competence allowance
- daily drop-point allowance
- overtime
- bonus
- other earnings
- arrears / adjustments
- gross pay

Do not hardcode this list if the canonical payroll result already provides
structured earning lines. Prefer rendering canonical earning components.

For derived items, optionally display a subordinate explanation line, e.g.:

Overtime
12.0 hours × RM xx.xxxx hourly basis × 1.5
RM xxx.xx

But the displayed explanation must reconcile exactly with the canonical result.

B. EMPLOYEE DEDUCTIONS / POTONGAN

Support:
- EPF Employee [S1]
- SOCSO Core / Employee [S2]
- SKBBK where applicable [S2/S2A]
- SOCSO Total where the engine distinguishes components
- EIS Employee [S3]
- PCB / MTD [S4]
- CP38 [S4]
- Zakat where applicable
- salary advance / recovery
- other deductions
- total deductions

PCB and CP38 MUST remain separate concepts.

C. EMPLOYER CONTRIBUTIONS / SUMBANGAN MAJIKAN

Show separately:
- EPF Employer [S1]
- SOCSO Employer [S2]
- EIS Employer [S3]
- HRD Corp levy only when canonical eligibility/calculation is verified
- other canonical employer contributions
- employer contribution total
- employer cost if the payroll model exposes it

Prominently label:

"Employer-paid contributions — not deducted from your salary."

SECTION 6 — NET PAY CONCLUSION

Show:
- payment method
- masked destination account where appropriate
- Net Pay / Gaji Bersih
- amount

Use the document grand-total rule treatment.

============================================================
TRANSPARENCY LAYER
============================================================

Add:

HOW THIS PAYSLIP IS CALCULATED / CARA PENGIRAAN

Keep concise and employee-readable.

Explain concepts such as:
- basic / prorated basic
- overtime basis
- gross pay
- EPF
- SOCSO
- EIS
- PCB / MTD
- CP38
- net pay

Do not claim a universal statutory percentage where the engine uses
tables/bands/classes/schedules.

Prefer employee-specific explanation from canonical calculation evidence.

Example:

EPF [S1]
Contribution wage       RM x,xxx.xx
Applicable rule/band     <canonical evidence>
Employee contribution   RM xxx.xx
Employer contribution   RM xxx.xx

SOCSO [S2]
Contribution wage       RM x,xxx.xx
Applicable band/ceiling <canonical evidence>
Employee                RM xx.xx
Employer                RM xx.xx

EIS [S3]
Contribution wage       RM x,xxx.xx
Applicable band/ceiling <canonical evidence>
Employee                RM xx.xx
Employer                RM xx.xx

PCB / MTD [S4]
PCB                      RM xxx.xx
CP38                     RM xxx.xx
Method/evidence status   <canonical verification status>

Do not dump internal implementation details onto the employee.
Show enough evidence to explain the result.

============================================================
YTD
============================================================

Add a compact THIS MONTH / YTD table where canonical YTD facts exist:

- Gross Pay
- Net Pay
- EPF Employee
- EPF Employer
- SOCSO where meaningful
- EIS where meaningful
- PCB / MTD
- CP38
- Zakat where applicable

YTD MUST be scoped to the legal employer unless the canonical statutory model
explicitly says otherwise.

For intercompany transfers:

CURRENT LEGAL EMPLOYER YTD
<Company B>

PRIOR LEGAL EMPLOYER REFERENCE
<Company A>

Do not combine them into one statutory YTD.

============================================================
RECTIFICATION / ADJUSTMENTS
============================================================

Add:

RECTIFICATION, EXCEPTIONS & PRIOR-PERIOD ADJUSTMENTS

Where applicable show:
- adjustment type
- period affected
- amount
- employee-readable reason
- supporting adjustment/evidence reference
- whether the document supersedes an earlier payslip
- replacement/superseded document reference

Do not use red merely because the amount is negative.

============================================================
PAGE 2 — CALCULATION & AUDIT ANNEX
============================================================

Create a second page/annex retained with the payslip.

It should contain:

A. AUDIT IDENTITY
- Payslip/document ID
- Audit ID
- Payroll Run ID
- legal employer
- payroll period
- Rule Pack ID/version
- Source Snapshot ID/version
- calculation/version identity if the architecture has one
- generated timestamp
- reprint identity if applicable

B. CALCULATION TRACE

For material payroll lines expose:

Line
Input / wage basis
Applicable rule/method
Canonical result
Source/evidence reference

Examples:
- prorated basic
- overtime
- EPF
- SOCSO/SKBBK
- EIS
- PCB
- CP38
- prior-period adjustment

Do not recalculate these values in the annex.

C. SOURCE REFERENCES

Use canonical source/evidence identities.

Preserve existing labels such as:
[S1] EPF
[S2/S2A] SOCSO / SKBBK
[S3] EIS
[S4] PCB / CP38

Do not hardcode legal text into the template when the controlled source registry
already provides the authoritative reference.

D. OVERRIDES / EXCEPTIONS

Show when applicable:
- override present?
- override reason
- evidence reference
- approved by
- approved timestamp
- statutory review status
- mapping/control status

E. APPROVAL / PROVENANCE

Use existing governance model.

Where available:
- prepared by
- reviewed by
- approved/released by
- timestamps
- approved payroll/run status

Do not fabricate signatures if the system uses electronic approval provenance.

============================================================
DOCUMENT COMPONENT ARCHITECTURE
============================================================

Prefer small reusable document components, adapted to the repository's existing
framework, conceptually similar to:

PayslipDocument
PayslipHeader
LegalEmployerIdentity
EmployeePaySummary
WorkBasis
PayEquation
PayrollBreakdown
EarningsSection
EmployeeDeductionsSection
EmployerContributionsSection
StatutoryWageBasis
CalculationExplanation
YtdSummary
AdjustmentHistory
NetPayConclusion
DocumentStatusMark
PayslipAuditAnnex
CalculationTrace
SourceReferenceList
ApprovalProvenance

Do not create abstraction for abstraction's sake.
Reuse the existing document system where possible.

============================================================
DATA CONTRACT
============================================================

Prefer ONE immutable document/read-model contract representing approved payroll
facts.

Conceptually it should contain:

identity
legalEmployer
employee
payPeriod
payment
workBasis
earnings[]
employeeDeductions[]
employerContributions[]
grossPay
totalDeductions
netPay
statutoryWageBases
statutoryCalculationEvidence
ytd
adjustments[]
overrides[]
sources[]
approval
auditIdentity
documentStatus

Do not allow the template to query many mutable tables ad hoc if the existing
architecture already supports a payroll/payslip snapshot or document projection.

If a proper immutable payslip projection does not exist:
STOP and report the minimum contract/change required before implementation.

============================================================
MONEY
============================================================

Use the repository's canonical Money/value object.

Requirements:
- no floating-point payroll arithmetic
- rendering preserves currency scale
- MYR displays to 2 decimal places
- tabular numerals
- right alignment
- nil display = —
- negative values remain neutral unless independently in an error state
- document calculations must reconcile exactly with payroll engine facts

============================================================
TESTS
============================================================

Add focused tests for at least:

1. Gross − deductions = net pay reconciliation.
2. Employer contributions do not reduce net pay.
3. PCB and CP38 render separately.
4. EPF/SOCSO/EIS wage bases can differ from gross pay.
5. Nil amount displays as —.
6. Money columns are deterministic.
7. Dark application theme still produces light document output.
8. Ordinary deductions never receive destructive styling.
9. Net pay does not use success styling/fill.
10. Page-break critical structures carry required print rules.
11. Legal employer comes from payroll/run facts, not department/cost centre.
12. Current-employer YTD is not combined with prior-employer YTD.
13. Adjustment reference renders when a prior-period correction exists.
14. Audit ID / Run ID / Rule Pack / Source Snapshot render.
15. Reprint/supersession status remains traceable.
16. PII is masked according to existing policy.
17. Document rendering does not mutate or calculate payroll facts.
18. Historical payslip rendering is stable against later employee/company master
    data changes, if the architecture promises snapshot immutability.

Add render/snapshot/visual tests according to existing project convention.

============================================================
PRINT ACCEPTANCE
============================================================

The implementation is not complete until:

- A4 output is clean.
- Light-only output is guaranteed.
- It remains readable in grayscale.
- No essential meaning relies only on colour.
- Table headers/subtotals survive browser print.
- Important rows/evidence blocks do not split.
- Long tables repeat headings.
- Money columns remain fixed and aligned.
- English/Malay labels fit.
- no raw hex exists inside the payslip templates/components.
- only --doc-* document tokens are consumed.
- app navigation/chrome does not print.
- no dark payslip can be generated.
- print/PDF output remains understandable without the application.

============================================================
NON-GOALS
============================================================

Do NOT:
- rewrite the payroll kernel
- change statutory calculation rules
- introduce another statutory table
- calculate PCB yourself in the template
- duplicate EPF/SOCSO/EIS algorithms
- redesign unrelated application screens
- modify the application colour system
- introduce marketing graphics
- use charts unless there is a genuine employee-facing need
- add decorative complexity
- make unrelated schema changes

============================================================
DELIVERABLES
============================================================

Implement:

1. Production employee payslip page/template.
2. Calculation & audit annex.
3. Document/read-model adapter from canonical payroll results.
4. Print stylesheet.
5. Required reusable document components.
6. Tests.
7. Representative specimen/fixture demonstrating:
   - basic salary
   - allowance
   - overtime
   - EPF
   - SOCSO
   - EIS
   - PCB
   - CP38 where supported
   - employer contributions
   - YTD
   - prior-period adjustment
   - audit identity
8. Short implementation report containing:
   - files changed
   - architecture used
   - canonical data source for each payslip section
   - any missing data/contract
   - tests executed
   - remaining risks

============================================================
IMPLEMENTATION DISCIPLINE
============================================================

Inspect first.
Make the smallest architecture-consistent change.
Do not invent missing payroll facts.
Do not weaken approval/evidence controls to make the document render.
Do not hide unresolved statutory/control states.

If any requirement conflicts with an existing authoritative repository doctrine,
STOP, identify the conflict and cite the relevant repository file before changing
the doctrine.

Proceed through implementation and verification.
