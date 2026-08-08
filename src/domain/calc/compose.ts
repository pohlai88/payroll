import { classify } from "./classify";
import { epf } from "./epf";
import { socso } from "./socso";
import { eis } from "./eis";
import { pcbNet } from "./pcb";
import { regularPay, overtimePay } from "./proration";
import { wageBases } from "./wage-base";
import { formatRM, roundHalfUpSen } from "../money";
import type {
  EmployeeSnapshot,
  LineInputs,
  LineItemInput,
  LineResult,
  OverrideInput,
  PayItemDef,
  PcbInput,
  RuleSettings,
  StatutoryTables,
  TraceStep,
} from "./types";

export interface ComposeOptions {
  employee: EmployeeSnapshot;
  inputs: LineInputs;
  payItems: PayItemDef[];
  tables: StatutoryTables;
  settings: RuleSettings;
  overrides?: OverrideInput[];
  pcb?: PcbInput | null;
  hrdfLevyEnabled?: boolean;
  hrdfLevyPct?: number;
}

/**
 * Full line computation: earnings → gross → three wage bases →
 * EPF/SOCSO/EIS (with overrides) → PCB net → deductions → net → employer cost.
 * Pure — every figure is traced for the audit annex.
 */
export function computeLine(opts: ComposeOptions): LineResult {
  const { employee, inputs, tables, settings } = opts;
  const trace: TraceStep[] = [];
  const matrix = new Map(opts.payItems.map((p) => [p.code, p]));
  const ovr = new Map((opts.overrides ?? []).map((o) => [o.field, o.overrideSen]));

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

  const items: Array<LineItemInput & { computed: boolean }> = [
    { payItemCode: "BASIC", amountSen: reg.amountSen, computed: true },
  ];

  const ot = overtimePay(inputs.otHours, inputs.otRateSen);
  if (ot > 0) {
    items.push({
      payItemCode: "OT",
      qty: inputs.otHours,
      rateSen: inputs.otRateSen,
      amountSen: ot,
      computed: true,
    });
    trace.push({
      label: "Overtime",
      detail: `${inputs.otHours} h × ${formatRM(inputs.otRateSen)}`,
      amountSen: ot,
    });
  }

  for (const item of inputs.items) {
    items.push({ ...item, computed: false });
  }

  const earnings = items.filter((i) => matrix.get(i.payItemCode)?.kind !== "DEDUCTION");
  const deductionsOther = items.filter((i) => matrix.get(i.payItemCode)?.kind === "DEDUCTION");

  const grossSen = earnings.reduce((s, i) => s + i.amountSen, 0);
  trace.push({ label: "Gross pay", detail: `Sum of ${earnings.length} earning items`, amountSen: grossSen });

  // ---- wage bases ----
  let { epfWagesSen, socsoWagesSen, eisWagesSen } = wageBases(earnings, matrix);
  if (ovr.has("EPF_WAGES")) epfWagesSen = ovr.get("EPF_WAGES")!;
  if (ovr.has("SOCSO_WAGES")) socsoWagesSen = ovr.get("SOCSO_WAGES")!;
  if (ovr.has("EIS_WAGES")) eisWagesSen = ovr.get("EIS_WAGES")!;
  trace.push({
    label: "Statutory wage bases",
    detail: `EPF ${formatRM(epfWagesSen)} / SOCSO ${formatRM(socsoWagesSen)} / EIS ${formatRM(eisWagesSen)}`,
  });

  // ---- statutory contributions ----
  const epfRes = epf(epfWagesSen, cls.epfPart, tables.epf, settings);
  const socsoRes = socso(socsoWagesSen, cls.socsoCategory, tables.socso, inputs.periodEnd, settings);
  const eisRes = eis(eisWagesSen, cls.eisEligible, tables.eis);

  const applyOvr = (field: OverrideInput["field"], computed: number): number => {
    if (!ovr.has(field)) return computed;
    const v = ovr.get(field)!;
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

  trace.push({ ...epfRes.trace, detail: `${epfRes.trace.detail} → EE ${formatRM(epfEeSen)} / ER ${formatRM(epfErSen)}` });
  trace.push({
    ...socsoRes.trace,
    detail: `${socsoRes.trace.detail} → ER ${formatRM(socsoErSen)} / EE core ${formatRM(socsoEeCoreSen)} / SKBBK ${formatRM(socsoEeSkbbkSen)}`,
  });
  trace.push({ ...eisRes.trace, detail: `${eisRes.trace.detail} → EE ${formatRM(eisEeSen)} / ER ${formatRM(eisErSen)}` });

  // ---- PCB (controlled input) ----
  const pcbRes = pcbNet(opts.pcb ?? null);
  const zakatSen = opts.pcb?.zakatOffsetSen ?? 0;
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
  const otherDeductionsSen = deductionsOther.reduce((s, i) => s + i.amountSen, 0);
  const statutoryEe = epfEeSen + socsoEeCoreSen + socsoEeSkbbkSen + eisEeSen;

  const pcbMissing = employee.pcbApplicable && pcbRes.netPcbSen === null;
  const pcbComponent = (pcbRes.netPcbSen ?? 0) + pcbRes.cp38Sen;
  const deductionsTotalSen = pcbMissing
    ? null
    : statutoryEe + pcbComponent + otherDeductionsSen;
  const netSen = deductionsTotalSen === null ? null : grossSen - deductionsTotalSen;

  const hrdfLevySen =
    opts.hrdfLevyEnabled && (opts.hrdfLevyPct ?? settings.hrdfLevyPct) > 0
      ? roundHalfUpSen((epfWagesSen * (opts.hrdfLevyPct ?? settings.hrdfLevyPct)) / 100)
      : 0;

  const employerCostSen = grossSen + epfErSen + socsoErSen + eisErSen + hrdfLevySen;

  trace.push({
    label: "Totals",
    detail:
      deductionsTotalSen === null
        ? "Deductions/net pending PCB entry"
        : `Deductions ${formatRM(deductionsTotalSen)}; Net ${formatRM(netSen!)}; Employer cost ${formatRM(employerCostSen)}`,
  });

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
    pcbNetSen: pcbRes.netPcbSen,
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
