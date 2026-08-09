/**
 * The English dictionary, and the definition of every message key in the system.
 *
 * `MessageKey` is `keyof typeof EN`, so emitting a key that is not defined here
 * fails to compile. `ms.ts` is typed as a total map over the same keys, so a
 * missing Malay translation also fails to compile.
 *
 * Placeholders are `{name}` and are substituted from the node's typed params.
 */

export const EN = {
  // ---- enum vocabulary (own namespace so codes never leak untranslated) ----
  "enum.EPF_PART.A": "Part A",
  "enum.EPF_PART.C": "Part C",
  "enum.EPF_PART.E": "Part E",
  "enum.EPF_PART.F": "Part F",
  "enum.EPF_PART.NONE": "not applicable",
  "enum.SOCSO_CATEGORY.FIRST": "First Category",
  "enum.SOCSO_CATEGORY.SECOND": "Second Category",
  "enum.SOCSO_CATEGORY.NONE": "not applicable",
  "enum.PAY_BASIS.MONTHLY": "monthly",
  "enum.PAY_BASIS.DAILY": "daily",
  "enum.PAY_BASIS.HOURLY": "hourly",
  "enum.EIS_ELIGIBILITY.ELIGIBLE": "eligible",
  "enum.EIS_ELIGIBILITY.NOT_ELIGIBLE": "not eligible",
  "enum.VERIFICATION_STATUS.VERIFIED": "verified",
  "enum.VERIFICATION_STATUS.UNVERIFIED": "not yet verified",
  "enum.VERIFICATION_STATUS.NOT_ENTERED": "not entered",

  // ---- inputs ----
  "input.dob": "Date of birth",
  "input.periodEnd": "End of wage period",
  "input.baseRate": "Base rate of pay",
  "input.workingDays": "Working days in the wage period",
  "input.paidDays": "Days paid",
  "input.hoursWorked": "Hours worked",
  "input.otHours": "Overtime hours",
  "input.otRate": "Overtime rate per hour",
  "input.itemQty": "{code} quantity",
  "input.itemRate": "{code} rate",

  // ---- rule pack settings ----
  "setting.epf.aboveEePct": "EPF employee rate above the schedule ceiling",
  "setting.epf.aboveErPct": "EPF employer rate above the schedule ceiling",
  "setting.epf.partFEePct": "EPF Part F employee rate",
  "setting.epf.partFErPct": "EPF Part F employer rate",
  "setting.hrdf.levyPct": "HRD Corp levy rate",

  // ---- classification ----
  "class.age": "Age at end of wage period",
  "class.age.detail": "Born {dob}, so {age} completed years on {periodEnd}",
  "class.epfPart": "EPF Third Schedule part",
  "class.epfPart.detail": "{part}, from age {age} and citizenship status",
  "class.epfPart.override": "{part}, set manually on the employee record",
  "class.epfPart.notApplicable": "EPF does not apply to this employee",
  "class.epfPart.noAge":
    "{part}, date of birth not on record — no age band applied",
  "class.socsoCategory": "SOCSO category",
  "class.socsoCategory.detail": "{category}, from age {age}",
  "class.socsoCategory.override":
    "{category}, set manually on the employee record",
  "class.socsoCategory.notApplicable": "SOCSO does not apply to this employee",
  "class.socsoCategory.noAge":
    "{category}, date of birth not on record — no age band applied",
  "class.eisEligible": "EIS eligibility",
  "class.eisEligible.detail":
    "{eligibility} — age {age} against the {min}–{max} range",
  "class.eisEligible.notApplicable": "EIS does not apply to this employee",
  "class.eisEligible.noAge":
    "Not eligible — date of birth not on record, so the {min}–{max} range cannot be applied",
  "class.eisEligible.age57Review":
    "Age {age}: first-time contribution history needs review",

  // ---- earnings ----
  "earn.basic": "Basic pay",
  "earn.item": "{code}",
  "earn.overtime": "Overtime",
  "earn.overtime.detail": "{hours} hours at {rate} per hour",
  "earn.perUnit.detail": "{days} days at {rate} per day",
  "earn.gross": "Gross pay",
  "earn.gross.detail": "Sum of {count} earnings",

  // ---- proration ----
  "proration.monthly": "Proration for days paid",
  "proration.monthly.detail": "{basic} × {paid} of {working} days",
  "proration.fullMonth":
    "Full month worked ({paid} of {working} days) — no proration applied",
  "proration.daily": "{days} days at {rate} per day",
  "proration.hourly": "{hours} hours at {rate} per hour",

  // ---- wage bases ----
  "wages.epf": "Wages subject to EPF",
  "wages.socso": "Wages subject to SOCSO",
  "wages.eis": "Wages subject to EIS",
  "wages.excluded.byMatrix":
    "{code} is not counted as wages for this contribution",

  // ---- EPF ----
  "epf.band": "EPF Third Schedule, {part}",
  "epf.band.matched":
    "Wages of {wages} fall in the {from}–{to} band, row {row} of {rows}",
  "epf.ee": "EPF employee contribution",
  "epf.er": "EPF employer contribution",
  "epf.column": "Employee column of the matched band",
  "epf.columnEr": "Employer column of the matched band",
  "epf.above.ee": "EPF employee contribution above the schedule ceiling",
  "epf.above.er": "EPF employer contribution above the schedule ceiling",
  "epf.above.detail":
    "Wages of {wages} exceed the {ceiling} schedule ceiling, so {pct} applies",
  "epf.partF.detail": "Part F flat rate of {pct}",
  "epf.na.part": "EPF does not apply to this employee",
  "epf.na.noWages": "No wages subject to EPF",

  // ---- SOCSO ----
  "socso.band": "SOCSO contribution table, Act 4",
  "socso.band.matched":
    "Wages of {wages} fall in the {from}–{to} band, row {row} of {rows}",
  "socso.er": "SOCSO employer contribution",
  "socso.eeCore": "SOCSO employee contribution",
  "socso.eeSkbbk": "SKBBK employee contribution",
  "socso.skbbk.window": "SKBBK phase in effect",
  "socso.skbbk.inWindow": "{periodEnd} falls within the {from} to {to} phase",
  "socso.skbbk.outsideWindow":
    "{periodEnd} falls outside the {from} to {to} phase",
  "socso.column": "{category} column of the matched band",
  "socso.na.category": "SOCSO does not apply to this employee",
  "socso.na.noWages": "No wages subject to SOCSO",

  // ---- EIS ----
  "eis.band": "EIS contribution table, Act 800",
  "eis.band.matched":
    "Wages of {wages} fall in the {from}–{to} band, row {row} of {rows}",
  "eis.ee": "EIS employee contribution",
  "eis.er": "EIS employer contribution",
  "eis.na.notEligible": "EIS does not apply to this employee",
  "eis.na.noWages": "No wages subject to EIS",

  // ---- PCB ----
  "pcb.declared": "PCB / MTD as recorded",
  "pcb.declared.notEntered": "Not yet entered — net pay cannot be determined",
  "pcb.declared.entered": "Recorded from {source}, {status}",
  "pcb.declared.computed":
    "Computed from the LHDN 2026 computerized MTD specification ({source})",
  "pcb.y1": "Current-month normal remuneration (Y1)",
  "pcb.k1": "Current-month EPF against Y1 (K1)",
  "pcb.zakat": "Zakat offset",
  "pcb.net": "PCB / MTD after zakat",
  "pcb.net.detail": "The greater of PCB less zakat of {zakat}, and nil",
  "pcb.cp38": "CP38 instalment",
  "pcb.na": "PCB does not apply to this employee",

  // ---- rounding ----
  "round.halfUp.detail": "{exact} rounded to {result}",
  "round.ceilRinggit.detail":
    "{exact} rounded up to {result}, a difference of {delta}",
  "round.noChange": "No rounding was needed",

  // ---- overrides ----
  "override.applied": "Manual override",
  "override.detail":
    "Calculated {computed}, overridden to {override} — {reason}",

  // ---- totals ----
  "total.statutoryEe": "Employee statutory deductions",
  "total.otherDeductions": "Other deductions",
  "total.otherDeductions.none": "No other deductions were recorded",
  "total.deductions": "Total deductions",
  "total.deductions.pendingPcb": "Cannot be determined until PCB is entered",
  "total.net": "Net pay",
  "total.net.detail": "Gross of {gross} less deductions of {deductions}",
  "total.net.pendingPcb": "Cannot be determined until PCB is entered",
  "total.hrdf": "HRD Corp levy",
  "total.hrdf.detail": "{pct} of wages subject to EPF",
  "total.hrdf.disabled": "The company is not registered for the HRD Corp levy",
  "total.employerCost": "Total cost to employer",
  "total.employerCost.detail": "Gross pay plus employer contributions and levy",

  // ---- generic operations ----
  "op.sum": "Sum",
  "op.percent": "{pct} of {base}",

  // Phase 8 — payslip document section labels
  "doc.payslip.title": "PAYSLIP",
  "doc.payslip.earnings": "EARNINGS",
  "doc.payslip.deductions": "EMPLOYEE DEDUCTIONS",
  "doc.payslip.employer-contributions": "EMPLOYER CONTRIBUTIONS",
  "doc.payslip.net-pay": "NET PAY",
  "doc.payslip.ytd": "YEAR-TO-DATE",
  "doc.payslip.ytd-provisional": "YEAR-TO-DATE (PROVISIONAL)",
  "doc.payslip.statutory-wages": "STATUTORY WAGE BASES",
  "doc.payslip.audit-annex": "CALCULATION & AUDIT ANNEX",
  "doc.payslip.employer-note":
    "Employer-paid contributions \u2014 not deducted from your salary.",
  "doc.payslip.preview-watermark": "PREVIEW \u2014 NOT ISSUED",
  "doc.payslip.employer-source-warning":
    "Employer identity sourced from current company record \u2014 not a payroll-time snapshot.",
} as const;

export type MessageKey = keyof typeof EN;
