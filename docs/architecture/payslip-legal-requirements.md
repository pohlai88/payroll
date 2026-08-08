# Payslip legal requirements — Malaysia (Peninsular)

Side-by-side comparison of **verified statutory / official guidance** against the
production payslip specification in [payslip.md](./payslip.md).

This document answers: *what must a Malaysian wage statement show, under which
law, and does our payslip spec already cover it?*

It does **not** redefine the payroll engine. Presentation rules stay in
[payslip.md](./payslip.md); schema/engine boundaries stay in
[payroll-architecture.md](./payroll-architecture.md).

**Status:** Research evidence for architecture and product copy. Not a human
sign-off that loads numeric rates into `employment_law_rules` or rule packs.
Follows the same cite-official-sources discipline as `governance/MY_STAT_S0x`.

---

## 1. Source register (instruments inspected)

| Ref | Instrument | What was verified | Official / primary URL | Notes |
|---|---|---|---|---|
| L-EA265 | Employment Act 1955 (Act 265), JTKSM reprint 2023-11 (includes A1651) | Full text / arrangement of sections for wage payment, deductions, payment method | https://jtksm.mohr.gov.my/sites/default/files/2023-11/Akta%20Kerja%201955%20(Akta%20265).pdf | **No** “itemised pay statement” / payslip content section |
| L-A1651 | Employment (Amendment) Act 2022 (Act A1651) | Confirms s.25 / s.25A amendments are about payment channel, not payslip fields | https://jtksm.mohr.gov.my/sites/default/files/2023-03/1.%20Employment%20%28Amendment%29%20Act%20A1651%20BI%20%281%29.pdf | Shoulder note of s.25A = payment other than via financial institution |
| L-EPF452 | Employees Provident Fund Act 1991 (Act 452) s.42 | Duty to prepare and furnish statement of wages; keep registers ≥ 6 years | https://www.kwsp.gov.my/en/others/resource-centre/references/epf-act-1991 | Primary **per-period** wage-statement duty |
| G-KWSP-REC | KWSP Employer Record-Keeping guidance | Operational 13-item list for wages statement / salary slip content under s.42 | https://www.kwsp.gov.my/en/employer/responsibilities/records | Prescribes the content “as may be prescribed by the rules” in practice |
| L-SOCSO4 | Employees’ Social Security Act 1969 (Act 4) | Contribution / deduction from wages; employer share not recoverable from employee | Official consolidations / PERKESO materials | **No** duty to hand employee an itemised payslip |
| L-EIS800 | Employment Insurance System Act 2017 (Act 800) s.78 | Employer must keep returns / registers / records per employee | Act 800 official text | Inspection / contribution records — **not** employee-facing slip content |
| L-ITA53 | Income Tax Act 1967 (Act 53) s.83(1A) | Annual statement of remuneration (Form EA / C.P.8A) to employee by end-February | LHDN / ITA consolidations; e.g. hasil.gov.my Form EA guidance | **Annual** document — distinct cadence from monthly payslip |
| — | Sabah / Sarawak labour ordinances | **Not inspected** | — | Open gap if product covers those states |

### Myth vs verified law (do not cite in product copy)

| Claim often seen online | Verified reality |
|---|---|
| “EA 1955 s.19 requires an itemised payslip” | s.19 = wages payable not later than the **7th day** after the wage period ends |
| “EA 1955 s.24A / itemised statement” | **No such section** in the Act 265 reprint inspected |
| “EA 1955 s.25A requires payslip contents” | s.25A = payment of wages **other than** through a financial institution (cash/cheque on written request + DG approval) |
| Singapore-style 12-field itemised pay slip under “Employment Act” | That framework is **Singapore** Employment Act Cap 91 s.96 + MOM pay-slip regulations — not Malaysia Act 265 |

**Working rule for Afenda docs and UI copy:** cite **EPF Act 1991 s.42** (and KWSP record guidance) for the monthly wage statement; cite **ITA 1967 s.83(1A)** for Form EA; cite EA 1955 only for wage timing, lawful deductions, and payment method — never as the payslip field list.

---

## 2. Side-by-side comparison — per pay period (wage statement)

Legal source for the field list: **EPF Act 1991 s.42(1)** + **KWSP Employer Record-Keeping** content list. Coverage column refers to [payslip.md](./payslip.md).

| # | Requirement | Legal source | Cadence | Covered in payslip.md? | Gap / note |
|---|---|---|---|---|---|
| 1 | Employee’s full name | EPF s.42 + KWSP list | Per period | **Yes** — §2 Employee & Payment Summary | — |
| 2 | EPF membership number | EPF s.42 + KWSP list | Per period | **Yes** — §2 “EPF number” | — |
| 3 | Gender | EPF s.42 + KWSP list | Per period | **No** | Spec does not list gender. Add to §2 if KWSP compliance is treated as mandatory field-for-field; or document as optional deferred field |
| 4 | Identification / passport number | EPF s.42 + KWSP list | Per period | **Partial** — §2 “masked NRIC/passport” | Statute/guidance expects the identity number to appear; privacy doctrine masks it. **Gap to resolve:** whether masking still satisfies KWSP inspection expectations, or whether a controlled unmasked employee copy / regulator reprint is required |
| 5 | Citizenship | EPF s.42 + KWSP list | Per period | **No** | Not listed in payslip.md §1–§2 |
| 6 | Wages / salary payment term (daily / weekly / monthly) | EPF s.42 + KWSP list | Per period | **Yes** — §2 “employment/pay basis” | Align labels with KWSP wording if needed |
| 7 | Wages / salary amount for the period | EPF s.42 + KWSP list | Per period | **Yes** — §4 Gross / §5A Earnings | — |
| 8 | Payment date of wages / salary | EPF s.42 + KWSP list | Per period | **Yes** — §1 “pay date”; §6 payment method | — |
| 9 | Other payments for the period | EPF s.42 + KWSP list | Per period | **Yes** — §5A allowances, OT, bonus, arrears, etc. | — |
| 10 | Amount deducted for EPF (employee share) | EPF s.42 + KWSP list | Per period | **Yes** — §5B “EPF Employee [S1]” | — |
| 11 | Employer registration number (EPF) | EPF s.42 + KWSP list | Per period | **Yes** — §1 “employer EPF reference” | Distinct from SSM company registration number (also in §1 — good practice, not this KWSP row) |
| 12 | Amount paid by employer for employer’s EPF share | EPF s.42 + KWSP list | Per period | **Yes** — §5C “EPF Employer [S1]” + label that it is not an employee deduction | Matches architecture rule: employer contributions ≠ deductions |
| 13 | Full name of employer / employer’s representative, signature, and statement date issued | EPF s.42 + KWSP list | Per period | **Partial** — §1 legal employer name; annex §E approval / provenance; “Do not fabricate signatures” | Electronic approval provenance can satisfy “who issued” without wet-ink signature, but **statement issue date** and a clear **issuer identity** (legal employer + released-by / generated timestamp) must remain visible. Wet signature is not required by our annex doctrine |

### Related EA 1955 obligations (not a field list, but presentation-relevant)

| Requirement | Legal source | Cadence | Covered in payslip.md? | Gap / note |
|---|---|---|---|---|
| Pay wages ≤ 7th day after wage period | EA 1955 s.19 | Per period | **Informational** — pay date shown; timing is operational, not a payslip field | Do not claim s.19 mandates payslip contents |
| Only lawful deductions; itemise nature in practice for transparency | EA 1955 s.24 | Per period | **Yes** — §5B itemised deductions (EPF, SOCSO, EIS, PCB, CP38, advances, etc.) | s.24 lists *permitted* deductions; it does **not** itself prescribe a slip layout |
| Pay via financial institution (default) | EA 1955 s.25 | Per period | **Yes** — §6 payment method + masked account | — |
| Cash/cheque only with written request + DG approval | EA 1955 s.25A | Exception | N/A to default bank payslip | Do not cite s.25A as “payslip law” |

### SOCSO / EIS (contribution law, not employee slip mandate)

| Requirement | Legal source | Cadence | Covered in payslip.md? | Gap / note |
|---|---|---|---|---|
| Deduct employee SOCSO / EIS where applicable; show separately from employer share | Act 4 / Act 800 contribution rules | Per period | **Yes** — §5B / §5C | Showing these on the slip is **best practice + EPF-statement completeness**, not a SOCSO/EIS “payslip section” |
| Keep employer registers / returns for inspection | EIS Act 800 s.78; SOCSO employer duties | Retention | **Beyond payslip** — audit annex / run snapshots | Payslip is employee-facing; retention is system/record duty |

---

## 3. Side-by-side comparison — annual (Form EA), not the monthly payslip

**Income Tax Act 1967 s.83(1A)** requires employers to prepare and render a **statement of remuneration** (Form EA / C.P.8A) to each employee on or before the last day of February following the year. This is a **different document** from the monthly payslip.

| # | Requirement (s.83(1A)) | Cadence | Covered by monthly payslip.md? | Gap / note |
|---|---|---|---|---|
| a | Relevant particulars of the employee | Annual | Partial overlap (§2) | Form EA product is out of scope for AFENDA-PAYSLIP-01 |
| b | Full amount of gross income under s.13 | Annual | Monthly gross ≠ annual EA gross | Need separate EA emission / year rollup |
| c | Pension / annuity / periodical payments under para (4)(e) | Annual | Not in payslip.md | EA-specific |
| d | Total PCB / MTD deductions paid to DG for the year | Annual | Monthly PCB in §5B; YTD PCB if canonical YTD exists | Annual EA total still required as Form EA |
| e | Compulsory employee EPF (or approved fund) contributions | Annual | Monthly + YTD in payslip | Same — annual Form EA remains mandatory |
| f | Arrears and other payments for prior years | Annual | Prior-period adjustments § Rectification | EA has dedicated arrears reporting |
| g | Tax-exempt allowances / perquisites / gifts / benefits | Annual | Not required on monthly slip | EA / tax classification concern |
| h | Other particulars DG may require | Annual | N/A | Follow LHDN Form EA layout |

**Conclusion for payslip.md:** monthly payslip **supports** employee understanding of PCB/EPF but **does not replace** Form EA. Do not mark AFENDA-PAYSLIP-01 complete for ITA s.83(1A).

---

## 4. Gap analysis conclusion

### 4.1 Legal / KWSP items missing or only partial in payslip.md

| Priority | Gap | Recommendation |
|---|---|---|
| P1 | **Gender** and **citizenship** absent from §2 | Add optional fields to the document contract / §2 when present on employment/person snapshot; omit row when null rather than inventing |
| P1 | **NRIC/passport masking vs KWSP “identification number”** | Keep employee-facing mask per privacy doctrine; ensure an approved/regulator or employee-authenticated full copy path exists, or document that the frozen snapshot retains full IC for evidence while print masks |
| P2 | **Issuer identity + statement date** (KWSP item 13) | Surface legal employer name (already §1), **document generated / released timestamp**, and approval provenance (annex §E) as the electronic substitute for wet signature — never invent a signature glyph |
| P3 | Sabah / Sarawak ordinances not reviewed | Flag if go-to-market includes East Malaysia |
| Separate product | Form EA (ITA s.83(1A)) | Track as a distinct annual document vertical — not a payslip annex |

### 4.2 Spec items that exceed statutory minimum (keep — do not cut)

These are **architecture / transparency** requirements, not EPF s.42 minimum fields. They remain correct product doctrine:

- Separate statutory wage bases (EPF / SOCSO / EIS) vs gross
- Itemised SOCSO, EIS, PCB, CP38 (PCB ≠ CP38)
- Employer contributions labelled as not deducted from salary
- YTD scoped to **legal employer** (not merged across group transfers)
- Calculation / audit annex (rule pack, source snapshot, run ID)
- Print / document palette rules, nil = em dash, no fake “success green” net pay

### 4.3 Language discipline for docs and UI

- Prefer: *“Wage statement content required under Employees Provident Fund Act 1991 s.42 and KWSP employer guidance.”*
- Avoid: *“Required under Employment Act 1955 s.19 / s.25A itemised payslip.”* (false citation)
- Prefer: *“Form EA under Income Tax Act 1967 s.83(1A) is annual and separate.”*
- Prefer: *“EA 1955 s.19 governs payment timing; s.24 lawful deductions; s.25/25A payment method.”*

---

## 5. Coverage summary (per-period KWSP list)

| Status | Count (of 13 KWSP rows) |
|---|---|
| Yes | 9 |
| Partial | 2 (masked IC; signature → electronic provenance) |
| No | 2 (gender; citizenship) |

**Net:** The production payslip spec in [payslip.md](./payslip.md) already covers the substantive monetary and identity core of the EPF wage statement. Remaining work is **field completeness** (gender, citizenship), **PII vs inspection** (IC display policy), and **issuer/date provenance** — not a rewrite of the document architecture.

---

## 6. Related documents

- [payslip.md](./payslip.md) — production payslip + audit annex specification
- [payroll-architecture.md](./payroll-architecture.md) — schema, engine, snapshot doctrine
- [presentation-facade.md](./presentation-facade.md) — UI / facade rules (null ≠ zero)
- `governance/MY_STAT_S04_EMPLOYMENT_LAW_INTAKE.md` — EA thresholds (hours, OT, min wage); not payslip fields
