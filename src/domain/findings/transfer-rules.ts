/**
 * §8.6 transfer finding detectors — pure evaluation over loaded facts.
 */

import type { DetectedFinding } from "./types";

export const TRANSFER_RULE_IDS = [
  "TRANSFER_OVERLAP_DATES",
  "PERSON_IN_BOTH_EMPLOYERS",
  "TRANSFER_FINAL_PAY_MISSING",
  "TRANSFER_PRIOR_TAX_MISSING",
  "SERVICE_DATES_INCONSISTENT",
  "RECEIVING_REGISTRATION_INVALID",
] as const;

export type TransferRuleId = (typeof TRANSFER_RULE_IDS)[number];

export interface TransferLinkFacts {
  readonly transferId: string;
  readonly personId: string;
  readonly fromEmploymentId: string;
  readonly toEmploymentId: string;
  readonly fromTerminationDate: string | null;
  readonly toJoinDate: string;
  readonly groupServiceContinuity: "CONTINUOUS" | "RESET";
  readonly groupServiceDate: string | null;
  readonly finalPayRunId: string | null;
  readonly commencementRunId: string | null;
}

/** Employment A end ≥ Employment B start for a linked transfer. */
export function detectTransferOverlapDates(
  facts: TransferLinkFacts
): DetectedFinding | null {
  if (
    facts.fromTerminationDate !== null &&
    facts.fromTerminationDate >= facts.toJoinDate
  ) {
    return {
      ruleId: "TRANSFER_OVERLAP_DATES",
      severity: "BLOCKING",
      blocks: ["APPROVAL"],
      title: "Transfer employment dates overlap",
      detail: `Employment A ends ${facts.fromTerminationDate} which is not before Employment B start ${facts.toJoinDate}`,
      evidence: {
        transferId: facts.transferId,
        fromTerminationDate: facts.fromTerminationDate,
        toJoinDate: facts.toJoinDate,
      },
      transferId: facts.transferId,
    };
  }
  return null;
}

/** CONTINUOUS continuity but groupServiceDate conflicts with join. */
export function detectServiceDatesInconsistent(
  facts: TransferLinkFacts
): DetectedFinding | null {
  if (facts.groupServiceContinuity !== "CONTINUOUS") {
    return null;
  }
  if (
    facts.groupServiceDate !== null &&
    facts.groupServiceDate > facts.toJoinDate
  ) {
    return {
      ruleId: "SERVICE_DATES_INCONSISTENT",
      severity: "REVIEW",
      blocks: ["APPROVAL"],
      title: "Group service date inconsistent with transfer",
      detail: `CONTINUOUS transfer but groupServiceDate ${facts.groupServiceDate} postdates join ${facts.toJoinDate}`,
      evidence: {
        transferId: facts.transferId,
        groupServiceDate: facts.groupServiceDate,
        toJoinDate: facts.toJoinDate,
      },
      transferId: facts.transferId,
    };
  }
  return null;
}

export interface DualEmployerFacts {
  readonly runId: string;
  readonly personId: string;
  readonly companyIds: readonly string[];
  readonly explainingTransferId: string | null;
}

/** Person in two employers' regular runs, same period, no transfer explaining it. */
export function detectPersonInBothEmployers(
  facts: DualEmployerFacts
): DetectedFinding | null {
  if (facts.companyIds.length < 2) {
    return null;
  }
  if (facts.explainingTransferId !== null) {
    return null;
  }
  return {
    ruleId: "PERSON_IN_BOTH_EMPLOYERS",
    severity: "WARNING",
    blocks: ["APPROVAL"],
    title: "Person appears under two employers without a transfer",
    detail: `Person ${facts.personId} has lines in companies ${facts.companyIds.join(", ")} with no linked transfer`,
    evidence: {
      personId: facts.personId,
      companyIds: [...facts.companyIds],
    },
    runId: facts.runId,
  };
}

export interface FinalPayMissingFacts {
  readonly runId: string;
  readonly transferId: string;
  readonly commencementRunId: string | null;
  readonly hasFinalPayCoveringLastPeriod: boolean;
}

export function detectTransferFinalPayMissing(
  facts: FinalPayMissingFacts
): DetectedFinding | null {
  if (facts.commencementRunId !== facts.runId) {
    return null;
  }
  if (facts.hasFinalPayCoveringLastPeriod) {
    return null;
  }
  return {
    ruleId: "TRANSFER_FINAL_PAY_MISSING",
    severity: "WARNING",
    blocks: ["APPROVAL"],
    title: "Transfer final pay missing at Company A",
    detail: `Commencement run ${facts.runId} is in play but Employment A has no final payroll covering its last period`,
    evidence: { transferId: facts.transferId, runId: facts.runId },
    runId: facts.runId,
    transferId: facts.transferId,
  };
}

export interface PriorTaxMissingFacts {
  readonly runId: string;
  readonly transferId: string;
  readonly employmentId: string;
  readonly pcbApplicable: boolean;
  readonly calendarYear: number;
  readonly priorYtdVerified: boolean;
}

export function detectTransferPriorTaxMissing(
  facts: PriorTaxMissingFacts
): DetectedFinding | null {
  if (!facts.pcbApplicable) {
    return null;
  }
  if (facts.priorYtdVerified) {
    return null;
  }
  return {
    ruleId: "TRANSFER_PRIOR_TAX_MISSING",
    severity: "REVIEW",
    blocks: ["APPROVAL"],
    title: "Prior-employer tax YTD missing or unverified",
    detail: `Transferred employment ${facts.employmentId} needs verified prior_employment_ytd for ${facts.calendarYear}`,
    evidence: {
      transferId: facts.transferId,
      employmentId: facts.employmentId,
      calendarYear: facts.calendarYear,
    },
    runId: facts.runId,
    transferId: facts.transferId,
  };
}

export interface ReceivingRegistrationFacts {
  readonly runId: string;
  readonly lineId: string;
  readonly employmentId: string;
  readonly epfApplicable: boolean;
  readonly socsoApplicable: boolean;
  readonly eisApplicable: boolean;
  readonly epfNo: string | null;
  readonly socsoNo: string | null;
}

export function detectReceivingRegistrationInvalid(
  facts: ReceivingRegistrationFacts
): DetectedFinding | null {
  const missing: string[] = [];
  if (facts.epfApplicable && !facts.epfNo?.trim()) {
    missing.push("epfNo");
  }
  if (facts.socsoApplicable && !facts.socsoNo?.trim()) {
    missing.push("socsoNo");
  }
  if (facts.eisApplicable && !facts.socsoNo?.trim()) {
    // EIS registration typically shares SOCSO employer/employee numbers in MY practice;
    // flag missing socsoNo when EIS applies without it.
    if (!missing.includes("socsoNo")) {
      missing.push("socsoNo");
    }
  }
  if (missing.length === 0) {
    return null;
  }
  return {
    ruleId: "RECEIVING_REGISTRATION_INVALID",
    severity: "REVIEW",
    blocks: ["APPROVAL"],
    title: "Receiving employment missing statutory identifiers",
    detail: `Employment ${facts.employmentId} lacks ${missing.join(", ")} for Company B schemes`,
    evidence: {
      employmentId: facts.employmentId,
      missing,
    },
    runId: facts.runId,
    lineId: facts.lineId,
  };
}

export function collectTransferCommitFindings(
  facts: TransferLinkFacts
): DetectedFinding[] {
  return [
    detectTransferOverlapDates(facts),
    detectServiceDatesInconsistent(facts),
  ].filter((f): f is DetectedFinding => f !== null);
}
