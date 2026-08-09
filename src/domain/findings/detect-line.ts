/**
 * Pure pay-run line detectors. Orchestration and DB I/O stay in the service.
 */

import { ageAt } from "@/domain/ic";
import {
  NET_VARIANCE_ABS_SEN,
  NET_VARIANCE_PCT,
  OT_HOURS_OUTLIER,
  OT_PAY_VS_BASIC_RATIO,
  ruleDef,
  VARIABLE_ITEM_SPIKE_SEN,
} from "./catalog";
import type { DetectedFinding } from "./types";

export interface LineFindingInput {
  readonly lineId: string;
  readonly employmentId: string;
  readonly netSen: number | null;
  readonly epfEeSen: number | null;
  readonly socsoEeCoreSen: number | null;
  readonly socsoErSen: number | null;
  readonly eisEeSen: number | null;
  readonly eisErSen: number | null;
  readonly epfWagesSen: number | null;
  readonly socsoWagesSen: number | null;
  readonly eisWagesSen: number | null;
  readonly employeeSnapshot: Record<string, unknown>;
}

export interface PriorLineBaseline {
  readonly netSen: number | null;
  readonly epfEeSen: number | null;
  readonly socsoEeCoreSen: number | null;
  readonly eisEeSen: number | null;
}

export interface LineItemInput {
  readonly itemCodeSnap: string;
  readonly resolvedAmountSen: number | null;
  readonly quantity: string | null;
}

export interface PcbEntryInput {
  readonly pcbAmountSen: number | null;
  readonly verified: boolean;
}

export interface EmploymentStatutoryInput {
  readonly epfNo: string | null;
  readonly socsoNo: string | null;
  readonly tin: string | null;
  readonly bankName: string | null;
  readonly bankAccountNo: string | null;
  readonly eisPriorContribution: boolean | null;
}

export function detected(
  ruleId: string,
  runId: string,
  lineId: string | null,
  evidence: Record<string, unknown>
): DetectedFinding {
  const def = ruleDef(ruleId);
  return {
    ruleId,
    severity: def.severity,
    blocks: def.blocks,
    title: def.title,
    detail: def.title,
    evidence,
    runId,
    lineId,
  };
}

export function detectPcbUnverified(
  line: LineFindingInput,
  pcb: PcbEntryInput | undefined,
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

export function detectNetNegative(
  line: LineFindingInput,
  runId: string
): DetectedFinding | null {
  if (line.netSen !== null && line.netSen < 0) {
    return detected("NET_NEGATIVE", runId, line.lineId, {
      netSen: line.netSen,
    });
  }
  return null;
}

export function detectNetZero(
  line: LineFindingInput,
  runId: string
): DetectedFinding | null {
  if (line.netSen === 0) {
    return detected("NET_ZERO", runId, line.lineId, { netSen: line.netSen });
  }
  return null;
}

export function detectNetVarianceVsPrior(
  line: LineFindingInput,
  baseline: PriorLineBaseline,
  baselineRunId: string | null,
  runId: string
): DetectedFinding | null {
  if (line.netSen === null || baseline.netSen === null) {
    return null;
  }
  const abs = Math.abs(line.netSen - baseline.netSen);
  const pct = netVariancePct(abs, baseline.netSen);
  if (abs > NET_VARIANCE_ABS_SEN && pct > NET_VARIANCE_PCT) {
    return detected("NET_VARIANCE_VS_PRIOR", runId, line.lineId, {
      netSen: line.netSen,
      baselineNetSen: baseline.netSen,
      baselineRunId,
      absVarianceSen: abs,
      pct,
    });
  }
  return null;
}

export function detectStatutoryStepShift(
  line: LineFindingInput,
  baseline: PriorLineBaseline,
  runId: string
): DetectedFinding | null {
  if (!(wagesSimilar(line, baseline) && statutoryStepShift(line, baseline))) {
    return null;
  }
  return detected("STATUTORY_STEP_SHIFT", runId, line.lineId, {
    epfEeSen: line.epfEeSen,
    baselineEpfEeSen: baseline.epfEeSen,
    socsoEeCoreSen: line.socsoEeCoreSen,
    baselineSocsoEeCoreSen: baseline.socsoEeCoreSen,
    eisEeSen: line.eisEeSen,
    baselineEisEeSen: baseline.eisEeSen,
  });
}

export function detectStatutoryZeroWithWages(
  line: LineFindingInput,
  runId: string
): DetectedFinding | null {
  const snap = line.employeeSnapshot;
  const epfApplicable = snap.epfApplicable !== false;
  const socsoApplicable = snap.socsoApplicable !== false;
  const eisApplicable = snap.eisApplicable !== false;

  // Scheme-specific wage bases — not baseRateSen.
  // SOCSO/EIS employer-only: ER > 0 with EE === 0 is legitimate.
  const zeroSchemes: string[] = [];
  if (
    epfApplicable &&
    (line.epfWagesSen ?? 0) > 0 &&
    (line.epfEeSen ?? 0) === 0
  ) {
    zeroSchemes.push("epf");
  }
  if (
    socsoApplicable &&
    (line.socsoWagesSen ?? 0) > 0 &&
    (line.socsoEeCoreSen ?? 0) === 0 &&
    (line.socsoErSen ?? 0) === 0
  ) {
    zeroSchemes.push("socso");
  }
  if (
    eisApplicable &&
    (line.eisWagesSen ?? 0) > 0 &&
    (line.eisEeSen ?? 0) === 0 &&
    (line.eisErSen ?? 0) === 0
  ) {
    zeroSchemes.push("eis");
  }
  if (zeroSchemes.length === 0) {
    return null;
  }
  return detected("STATUTORY_ZERO_WITH_WAGES", runId, line.lineId, {
    schemes: zeroSchemes,
    epfEeSen: line.epfEeSen,
    socsoEeCoreSen: line.socsoEeCoreSen,
    eisEeSen: line.eisEeSen,
    epfWagesSen: line.epfWagesSen,
    socsoWagesSen: line.socsoWagesSen,
    eisWagesSen: line.eisWagesSen,
  });
}

export function detectEisAgeHistoryUnresolved(
  line: LineFindingInput,
  eisPriorContribution: boolean | null | undefined,
  periodEnd: string,
  runId: string
): DetectedFinding | null {
  const eisApplicable = line.employeeSnapshot.eisApplicable !== false;
  if (
    !eisApplicable ||
    eisPriorContribution !== null ||
    !isAge57Plus(line.employeeSnapshot, periodEnd)
  ) {
    return null;
  }
  const { dob } = line.employeeSnapshot;
  const age = typeof dob === "string" ? ageAt(dob, periodEnd) : null;
  return detected("EIS_AGE_HISTORY_UNRESOLVED", runId, line.lineId, {
    eisPriorContribution: null,
    age,
    periodEnd,
  });
}

export function detectOtOutlier(
  line: LineFindingInput,
  item: LineItemInput,
  runId: string
): DetectedFinding | null {
  if (item.itemCodeSnap !== "OT") {
    return null;
  }
  const hours = Number(item.quantity ?? 0);
  const otPay = item.resolvedAmountSen ?? 0;
  const basic = Number(line.employeeSnapshot.baseRateSen ?? 0);
  if (
    hours > OT_HOURS_OUTLIER ||
    (basic > 0 && otPay > basic * OT_PAY_VS_BASIC_RATIO)
  ) {
    return detected("OT_OUTLIER", runId, line.lineId, {
      hours,
      otPaySen: otPay,
      basicSen: basic,
    });
  }
  return null;
}

export function detectVariableItemSpike(
  line: LineFindingInput,
  item: LineItemInput,
  runId: string
): DetectedFinding | null {
  if (
    item.itemCodeSnap === "BASIC" ||
    item.itemCodeSnap === "OT" ||
    (item.resolvedAmountSen ?? 0) <= VARIABLE_ITEM_SPIKE_SEN
  ) {
    return null;
  }
  return detected("VARIABLE_ITEM_SPIKE", runId, line.lineId, {
    itemCode: item.itemCodeSnap,
    amountSen: item.resolvedAmountSen,
  });
}

export function detectMissingStatutoryNo(
  line: LineFindingInput,
  emp: EmploymentStatutoryInput,
  runId: string
): DetectedFinding | null {
  const snap = line.employeeSnapshot;
  const epfApplicable = snap.epfApplicable !== false;
  const socsoApplicable = snap.socsoApplicable !== false;
  const pcbApplicable = snap.pcbApplicable !== false;
  const missing: string[] = [];
  if (epfApplicable && blank(emp.epfNo)) {
    missing.push("epfNo");
  }
  if (socsoApplicable && blank(emp.socsoNo)) {
    missing.push("socsoNo");
  }
  if (pcbApplicable && blank(emp.tin)) {
    missing.push("tin");
  }
  if (missing.length === 0) {
    return null;
  }
  return detected("MISSING_STATUTORY_NO", runId, line.lineId, { missing });
}

export function detectBankDetailsMissing(
  line: LineFindingInput,
  emp: EmploymentStatutoryInput,
  runId: string
): DetectedFinding | null {
  const account = emp.bankAccountNo?.trim() ?? "";
  const bank = emp.bankName?.trim() ?? "";
  if (account === "" || bank === "") {
    return detected("BANK_DETAILS_MISSING", runId, line.lineId, {
      bankName: bank || null,
      bankAccountNo: account || null,
    });
  }
  return null;
}

function netVariancePct(
  absVarianceSen: number,
  baselineNetSen: number
): number {
  if (baselineNetSen === 0) {
    return absVarianceSen > 0 ? 1 : 0;
  }
  return absVarianceSen / Math.abs(baselineNetSen);
}

function wagesSimilar(
  line: LineFindingInput,
  baseline: { epfEeSen: number | null; netSen: number | null }
): boolean {
  if (
    line.netSen === null ||
    baseline.netSen === null ||
    baseline.netSen === 0
  ) {
    return false;
  }
  const pct =
    Math.abs(line.netSen - baseline.netSen) / Math.abs(baseline.netSen);
  return pct <= 0.1;
}

function statutoryStepShift(
  line: LineFindingInput,
  baseline: {
    epfEeSen: number | null;
    socsoEeCoreSen: number | null;
    eisEeSen: number | null;
  }
): boolean {
  const steps = (a: number | null, b: number | null) => {
    if (a === null || b === null || a === b) {
      return false;
    }
    return true;
  };
  return (
    steps(line.epfEeSen, baseline.epfEeSen) ||
    steps(line.socsoEeCoreSen, baseline.socsoEeCoreSen) ||
    steps(line.eisEeSen, baseline.eisEeSen)
  );
}

function isAge57Plus(
  snap: Record<string, unknown>,
  periodEnd: string
): boolean {
  if (typeof snap.dob !== "string" || snap.dob.trim() === "") {
    return false;
  }
  return ageAt(snap.dob, periodEnd) >= 57;
}

function blank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}
