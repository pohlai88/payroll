import { formatRM, roundHalfUpSen } from "../money";
import { classify } from "./classify";
import { eis } from "./eis";
import { epf } from "./epf";
import { pcbNet } from "./pcb";
import { regularPay } from "./proration";
import { resolveItems } from "./resolve-items";
import { socso } from "./socso";
import type {
  EmployeeSnapshot,
  LineInputs,
  LineResult,
  OverrideInput,
  PayItemDef,
  PcbInput,
  ResolvedLineItem,
  RuleSettings,
  StatutoryTables,
  TraceStep,
} from "./types";
import { type ValidationIssue, validateLineInputs } from "./validate";
import { wageBases } from "./wage-base";

export interface ComposeOptions {
  employee: EmployeeSnapshot;
  inputs: LineInputs;
  payItems: PayItemDef[];
  tables: StatutoryTables;
  settings: RuleSettings;
  // `readonly` so a `DeriveOptions` — whose overrides carry extra justification
  // fields and are declared readonly — can be passed straight through. Compose
  // only reads them into a lookup map.
  overrides?: readonly OverrideInput[];
  pcb?: PcbInput | null;
  hrdfLevyEnabled?: boolean;
  hrdfLevyPct?: number;
}

export type ComputeLineOutcome =
  | { ok: true; result: LineResult }
  | { ok: false; issues: ValidationIssue[] };

/**
 * Validated entry point. Any caller taking input from a user, an API request or
 * an import should use this rather than `computeLine`: a misconfigured period
 * comes back as structured issues with field paths instead of a `RangeError`
 * from the arithmetic primitives.
 */
export function computeLineChecked(opts: ComposeOptions): ComputeLineOutcome {
  const issues = validateLineInputs(opts.employee, opts.inputs);
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, result: computeLine(opts) };
}

/**
 * Full line computation: earnings → gross → three wage bases →
 * EPF/SOCSO/EIS (with overrides) → PCB net → deductions → net → employer cost.
 * Pure — every figure is traced for the audit annex.
 *
 * Assumes inputs already satisfy `validateLineInputs`; unvalidated input can
 * reach the arithmetic primitives and throw. Prefer `computeLineChecked`.
 */
export function computeLine(opts: ComposeOptions): LineResult {
  const { employee, inputs, tables, settings } = opts;
  const trace: TraceStep[] = [];
  const matrix = new Map(opts.payItems.map((p) => [p.code, p]));
  const ovr = new Map(
    (opts.overrides ?? []).map((o) => [o.field, o.overrideSen])
  );

  // ---- classification ----
  const cls = classify(employee, inputs.periodEnd, settings);
  trace.push({
    label: "Classification",
    detail: `Age ${cls.ageAtPeriodEnd ?? "?"} at ${inputs.periodEnd}: EPF Part ${cls.epfPart}, SOCSO ${cls.socsoCategory}, EIS ${cls.eisEligible ? "eligible" : "not eligible"}${cls.eisAge57Review ? " (age-57 history review required)" : ""}`,
  });

  // ---- earnings ----
  const reg = regularPay(
    employee.payBasis,
    employee.baseRateSen,
    inputs.workingDays,
    inputs.paidDays,
    inputs.hoursWorked
  );
  trace.push(reg.trace);

  /**
   * BASIC is the only item the engine derives from the employee record. Every
   * other earning and deduction — overtime included — is an entered item whose
   * amount follows the basis configured on its pay item.
   */
  const items: ResolvedLineItem[] = [
    {
      payItemCode: "BASIC",
      basis: employee.payBasis === "MONTHLY" ? "FIXED_MONTHLY" : "PER_DAY",
      qty: null,
      rateSen: employee.baseRateSen,
      amountSen: reg.amountSen,
      computed: true,
    },
    ...resolveItems(inputs.items, matrix),
  ];

  for (const item of items) {
    if (item.computed) {
      continue;
    }
    trace.push({
      label: item.payItemCode,
      detail:
        item.qty === null || item.rateSen === null
          ? "Entered amount"
          : `${item.qty} × ${formatRM(item.rateSen)}`,
      amountSen: item.amountSen,
    });
  }

  const earnings = items.filter(
    (i) => matrix.get(i.payItemCode)?.kind !== "DEDUCTION"
  );
  const deductionsOther = items.filter(
    (i) => matrix.get(i.payItemCode)?.kind === "DEDUCTION"
  );

  const grossSen = earnings.reduce((s, i) => s + i.amountSen, 0);
  trace.push({
    label: "Gross pay",
    detail: `Sum of ${earnings.length} earning items`,
    amountSen: grossSen,
  });

  // ---- wage bases ----
  const computedBases = wageBases(earnings, matrix);
  // A single `get` carries its own narrowing; `has` + `get!` asserted away the
  // one case that matters — an override recorded as absent.
  const epfWagesSen = ovr.get("EPF_WAGES") ?? computedBases.epfWagesSen;
  const socsoWagesSen = ovr.get("SOCSO_WAGES") ?? computedBases.socsoWagesSen;
  const eisWagesSen = ovr.get("EIS_WAGES") ?? computedBases.eisWagesSen;
  trace.push({
    label: "Statutory wage bases",
    detail: `EPF ${formatRM(epfWagesSen)} / SOCSO ${formatRM(socsoWagesSen)} / EIS ${formatRM(eisWagesSen)}`,
  });

  // ---- statutory contributions ----
  const epfRes = epf(epfWagesSen, cls.epfPart, tables.epf, settings);
  const socsoRes = socso(
    socsoWagesSen,
    cls.socsoCategory,
    tables.socso,
    inputs.periodEnd,
    settings
  );
  const eisRes = eis(eisWagesSen, cls.eisEligible, tables.eis);

  const applyOvr = (
    field: OverrideInput["field"],
    computed: number
  ): number => {
    const v = ovr.get(field);
    if (v === undefined) {
      return computed;
    }
    trace.push({
      label: `Override ${field}`,
      detail: `Computed ${formatRM(computed)} overridden to ${formatRM(v)}`,
      amountSen: v,
    });
    return v;
  };

  const epfEeSen = applyOvr("EPF_EE", epfRes.eeSen);
  const epfErSen = applyOvr("EPF_ER", epfRes.erSen);
  const socsoEeCoreSen = applyOvr("SOCSO_EE_CORE", socsoRes.eeCoreSen);
  const socsoEeSkbbkSen = applyOvr("SOCSO_EE_SKBBK", socsoRes.eeSkbbkSen);
  const socsoErSen = applyOvr("SOCSO_ER", socsoRes.erSen);
  const eisEeSen = applyOvr("EIS_EE", eisRes.eeSen);
  const eisErSen = applyOvr("EIS_ER", eisRes.erSen);

  trace.push({
    ...epfRes.trace,
    detail: `${epfRes.trace.detail} → EE ${formatRM(epfEeSen)} / ER ${formatRM(epfErSen)}`,
  });
  trace.push({
    ...socsoRes.trace,
    detail: `${socsoRes.trace.detail} → ER ${formatRM(socsoErSen)} / EE core ${formatRM(socsoEeCoreSen)} / SKBBK ${formatRM(socsoEeSkbbkSen)}`,
  });
  trace.push({
    ...eisRes.trace,
    detail: `${eisRes.trace.detail} → EE ${formatRM(eisEeSen)} / ER ${formatRM(eisErSen)}`,
  });

  // ---- PCB (controlled input) ----
  const pcbRes = pcbNet(opts.pcb ?? null);
  const zakatSen = opts.pcb?.zakatOffsetSen ?? 0;
  /**
   * `null` means "not entered, so unknowable" and must block net pay. An
   * employee outside PCB with nothing entered is not unknowable — nothing is
   * due. Reporting `null` there contradicted the totals below, which already
   * added zero and produced a real net, so the payslip showed an unknown next
   * to a net that had quietly assumed zero.
   */
  const pcbNetSen =
    pcbRes.netPcbSen === null &&
    !employee.pcbApplicable &&
    opts.pcb?.pcbAmountSen == null
      ? 0
      : pcbRes.netPcbSen;
  if (employee.pcbApplicable) {
    trace.push({
      label: "PCB / MTD",
      detail:
        pcbRes.netPcbSen === null
          ? "NOT ENTERED — pending verification (never treated as zero)"
          : `max(PCB − zakat ${formatRM(zakatSen)}, 0)${pcbRes.verified ? " [VERIFIED]" : " [UNVERIFIED]"}`,
      amountSen: pcbRes.netPcbSen ?? undefined,
    });
  }

  // ---- totals ----
  const otherDeductionsSen = deductionsOther.reduce(
    (s, i) => s + i.amountSen,
    0
  );
  const statutoryEe = epfEeSen + socsoEeCoreSen + socsoEeSkbbkSen + eisEeSen;

  const pcbMissing = pcbNetSen === null;
  const pcbComponent = (pcbNetSen ?? 0) + pcbRes.cp38Sen;
  const deductionsTotalSen = pcbMissing
    ? null
    : statutoryEe + pcbComponent + otherDeductionsSen;
  const netSen =
    deductionsTotalSen === null ? null : grossSen - deductionsTotalSen;

  const hrdfLevySen =
    opts.hrdfLevyEnabled && (opts.hrdfLevyPct ?? settings.hrdfLevyPct) > 0
      ? roundHalfUpSen(
          (epfWagesSen * (opts.hrdfLevyPct ?? settings.hrdfLevyPct)) / 100
        )
      : 0;

  const employerCostSen =
    grossSen + epfErSen + socsoErSen + eisErSen + hrdfLevySen;

  // Both go null together (net is derived from the total), but testing both is
  // what lets the compiler prove the formatted branch has real figures.
  const totalsDetail =
    deductionsTotalSen === null || netSen === null
      ? "Deductions/net pending PCB entry"
      : `Deductions ${formatRM(deductionsTotalSen)}; Net ${formatRM(netSen)}; Employer cost ${formatRM(employerCostSen)}`;
  trace.push({ label: "Totals", detail: totalsDetail });

  return {
    classification: cls,
    items,
    grossSen,
    epfWagesSen,
    socsoWagesSen,
    eisWagesSen,
    epfEeSen,
    epfErSen,
    socsoEeCoreSen,
    socsoEeSkbbkSen,
    socsoErSen,
    eisEeSen,
    eisErSen,
    pcbNetSen,
    cp38Sen: pcbRes.cp38Sen,
    zakatSen,
    otherDeductionsSen,
    deductionsTotalSen,
    netSen,
    hrdfLevySen,
    employerCostSen,
    trace,
  };
}
