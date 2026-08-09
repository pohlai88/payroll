/**
 * @feature payslip
 * @layer repo
 * @hub src/server/routes/pay-run-payslip.ts
 *
 * Payslip read models — index + full document DTO for a pay line.
 *
 * Masking and YTD aggregation live here so the route stays thin. Authorization
 * (`requirePayRunAccess`) is the caller's job.
 */

import { and, asc, eq, inArray, lte } from "drizzle-orm";
import type { Database } from "@/db/client";
import { companies } from "@/db/schema/parties";
import { payLineItems, payLines, payRuns } from "@/db/schema/run";
import { sumNullableSen } from "@/domain/sum-nullable-sen";
import { buildRootsFromLine } from "./pay-line-roots";

/** Keep in sync with `src/web/payrun/payslip-document/types.ts`. */
export interface PayslipIndexRow {
  readonly lineId: string;
  readonly employeeCode: string;
  readonly employeeName: string;
  readonly netSen: number | null;
}

/** Keep in sync with `src/web/payrun/payslip-document/types.ts` `PayslipDocumentDto`. */
export interface PayslipDocumentDto {
  readonly documentId: string;
  readonly generatedAt: string;
  readonly documentStatus: "APPROVED" | "CLOSED" | "DRAFT_PREVIEW";
  readonly employerSourceWarning: "LIVE_COMPANY_RECORD";
  readonly legalEmployer: {
    readonly name: string;
    readonly registrationNumber: null;
    readonly epfReference: null;
    readonly socsoReference: null;
    readonly eisReference: null;
    readonly lhdnReference: null;
    readonly representativeName: null;
  };
  readonly employee: {
    readonly id: string;
    readonly name: string;
    readonly code: string;
    readonly designation: string | null;
    readonly department: string | null;
    readonly maskedNric: string | null;
    readonly gender: string | null;
    readonly citizenship: string | null;
    readonly epfNumber: string | null;
    readonly socsoNumber: string | null;
    readonly payBasis: string | null;
  };
  readonly payPeriod: {
    readonly reportingMonth: string;
    readonly periodStart: string;
    readonly periodEnd: string;
    readonly paymentDate: null;
    readonly runId: string;
    readonly label: string;
    readonly workingDays: number;
  };
  readonly payment: {
    readonly method: null;
    readonly maskedBankAccount: string | null;
    readonly statementDate: string | null;
  };
  readonly lineItems: readonly {
    readonly kind: string;
    readonly codeSnap: string;
    readonly nameEnSnap: string;
    readonly nameMsSnap: string;
    readonly resolvedAmountSen: number | null;
    readonly quantity: string | null;
    readonly rateSen: number | null;
  }[];
  readonly roots: ReturnType<typeof buildRootsFromLine>;
  readonly statutoryWageBases: {
    readonly epfWagesSen: number | null;
    readonly socsoWagesSen: number | null;
    readonly eisWagesSen: number | null;
  };
  readonly ytd: {
    readonly grossSen: number;
    readonly netSen: number;
    readonly epfEeSen: number;
    readonly epfErSen: number;
    readonly socsoEeCoreSen: number;
    readonly eisEeSen: number;
    readonly pcbNetSen: number;
    readonly cp38Sen: number;
    readonly isProvisional: boolean;
    readonly incomplete: boolean;
  } | null;
  readonly approval: {
    readonly reviewedBy: string | null;
    readonly reviewedAt: string | null;
    readonly approvedBy: string | null;
    readonly approvedAt: string | null;
    readonly closedBy: string | null;
    readonly closedAt: string | null;
  };
  readonly auditIdentity: {
    readonly runId: string;
    readonly calcRevision: string | null;
    readonly rulePackId: string;
    readonly rulePackHash: string | null;
    readonly calcEngineVersion: string | null;
  };
}

function maskNric(ic: string | null | undefined): string | null {
  if (!ic) {
    return null;
  }
  const digits = ic.replace(/\D/g, "");
  if (digits.length !== 12) {
    return "****-**-????";
  }
  return `****-**-${digits.slice(-4)}`;
}

function maskBankAccount(acct: string | null | undefined): string | null {
  if (!acct) {
    return null;
  }
  return acct.length > 4 ? `****${acct.slice(-4)}` : "****";
}

function docStatusFromRunStatus(
  status: string
): "APPROVED" | "CLOSED" | "DRAFT_PREVIEW" {
  if (status === "APPROVED") {
    return "APPROVED";
  }
  if (status === "CLOSED") {
    return "CLOSED";
  }
  return "DRAFT_PREVIEW";
}

export type PayslipLoadResult =
  | { readonly ok: true; readonly document: PayslipDocumentDto }
  | { readonly ok: false; readonly missing: "run" | "line" };

export async function listPayslipIndex(
  db: Database,
  runId: string
): Promise<PayslipIndexRow[]> {
  const lines = await db
    .select({
      id: payLines.id,
      employeeSnapshot: payLines.employeeSnapshot,
      netSen: payLines.netSen,
    })
    .from(payLines)
    .where(eq(payLines.runId, runId));

  return lines.map((line) => {
    const snap = line.employeeSnapshot as { id?: string; name?: string };
    return {
      lineId: line.id,
      employeeCode: snap.id ?? line.id,
      employeeName: snap.name ?? "Unknown",
      netSen: line.netSen,
    };
  });
}

export async function loadPayslipDocument(
  db: Database,
  runId: string,
  lineId: string
): Promise<PayslipLoadResult> {
  const [run] = await db
    .select({
      id: payRuns.id,
      companyId: payRuns.companyId,
      year: payRuns.year,
      month: payRuns.month,
      periodStart: payRuns.periodStart,
      periodEnd: payRuns.periodEnd,
      workingDays: payRuns.workingDays,
      status: payRuns.status,
      calcRevision: payRuns.calcRevision,
      rulePackId: payRuns.rulePackId,
      rulePackHash: payRuns.rulePackHash,
      calcEngineVersion: payRuns.calcEngineVersion,
      reviewedBy: payRuns.reviewedBy,
      reviewedAt: payRuns.reviewedAt,
      approvedBy: payRuns.approvedBy,
      approvedAt: payRuns.approvedAt,
      closedBy: payRuns.closedBy,
      closedAt: payRuns.closedAt,
      companyName: companies.name,
    })
    .from(payRuns)
    .innerJoin(companies, eq(payRuns.companyId, companies.id))
    .where(eq(payRuns.id, runId))
    .limit(1);

  if (run === undefined) {
    return { ok: false, missing: "run" };
  }

  const [line] = await db
    .select()
    .from(payLines)
    .where(and(eq(payLines.id, lineId), eq(payLines.runId, runId)))
    .limit(1);

  if (line === undefined) {
    return { ok: false, missing: "line" };
  }

  const items = await db
    .select()
    .from(payLineItems)
    .where(eq(payLineItems.lineId, lineId))
    .orderBy(asc(payLineItems.sortSnap));

  const snap = line.employeeSnapshot as {
    id?: string;
    name?: string;
    designation?: string;
    department?: string;
    ic?: string;
    bankAccount?: string;
    epfNo?: string;
    socsoNo?: string;
    gender?: string;
    citizenship?: string;
    payBasis?: string;
  };

  const reportingMonth = `${run.year}-${String(run.month).padStart(2, "0")}`;
  const docStatus = docStatusFromRunStatus(run.status);
  const statementDate =
    run.approvedAt?.toISOString() ?? run.closedAt?.toISOString() ?? null;

  const ytdRuns = await db
    .select({
      id: payRuns.id,
      status: payRuns.status,
    })
    .from(payRuns)
    .where(
      and(
        eq(payRuns.companyId, run.companyId),
        eq(payRuns.year, run.year),
        lte(payRuns.month, run.month)
      )
    );

  const finalizedRunIds = ytdRuns
    .filter((r) => r.status === "APPROVED" || r.status === "CLOSED")
    .map((r) => r.id);

  const isProvisional = docStatus === "DRAFT_PREVIEW";

  let ytd: PayslipDocumentDto["ytd"] = null;

  if (finalizedRunIds.length > 0 || isProvisional) {
    const ytdLines =
      finalizedRunIds.length > 0
        ? await db
            .select()
            .from(payLines)
            .where(
              and(
                eq(payLines.employmentId, line.employmentId),
                inArray(payLines.runId, finalizedRunIds)
              )
            )
        : [];

    const sumField = (key: keyof (typeof ytdLines)[number]) =>
      sumNullableSen(ytdLines.map((l) => l[key] as number | null));
    const finalizedGross = sumField("grossSen");
    const finalizedNet = sumField("netSen");
    const finalizedEpfEe = sumField("epfEeSen");
    const finalizedEpfEr = sumField("epfErSen");
    const finalizedSocso = sumField("socsoEeCoreSen");
    const finalizedEis = sumField("eisEeSen");
    const finalizedPcb = sumField("pcbNetSen");
    const finalizedCp38 = sumField("cp38Sen");
    const finalizedIncomplete =
      finalizedGross.incomplete ||
      finalizedNet.incomplete ||
      finalizedEpfEe.incomplete ||
      finalizedEpfEr.incomplete ||
      finalizedSocso.incomplete ||
      finalizedEis.incomplete ||
      finalizedPcb.incomplete ||
      finalizedCp38.incomplete;

    const addCurrent = (
      base: { sum: number; incomplete: boolean },
      current: number | null
    ) => {
      const merged = sumNullableSen([base.sum, current]);
      return {
        sum: merged.sum,
        incomplete: base.incomplete || merged.incomplete,
      };
    };

    if (isProvisional) {
      const gross = addCurrent(finalizedGross, line.grossSen);
      const net = addCurrent(finalizedNet, line.netSen);
      const epfEe = addCurrent(finalizedEpfEe, line.epfEeSen);
      const epfEr = addCurrent(finalizedEpfEr, line.epfErSen);
      const socso = addCurrent(finalizedSocso, line.socsoEeCoreSen);
      const eis = addCurrent(finalizedEis, line.eisEeSen);
      const pcb = addCurrent(finalizedPcb, line.pcbNetSen);
      const cp38 = addCurrent(finalizedCp38, line.cp38Sen);
      ytd = {
        grossSen: gross.sum,
        netSen: net.sum,
        epfEeSen: epfEe.sum,
        epfErSen: epfEr.sum,
        socsoEeCoreSen: socso.sum,
        eisEeSen: eis.sum,
        pcbNetSen: pcb.sum,
        cp38Sen: cp38.sum,
        isProvisional: true,
        incomplete:
          gross.incomplete ||
          net.incomplete ||
          epfEe.incomplete ||
          epfEr.incomplete ||
          socso.incomplete ||
          eis.incomplete ||
          pcb.incomplete ||
          cp38.incomplete,
      };
    } else {
      ytd = {
        grossSen: finalizedGross.sum,
        netSen: finalizedNet.sum,
        epfEeSen: finalizedEpfEe.sum,
        epfErSen: finalizedEpfEr.sum,
        socsoEeCoreSen: finalizedSocso.sum,
        eisEeSen: finalizedEis.sum,
        pcbNetSen: finalizedPcb.sum,
        cp38Sen: finalizedCp38.sum,
        isProvisional: false,
        incomplete: finalizedIncomplete,
      };
    }
  }

  return {
    ok: true,
    document: {
      documentId: `PSL-${runId}-${lineId}`,
      generatedAt: new Date().toISOString(),
      documentStatus: docStatus,
      employerSourceWarning: "LIVE_COMPANY_RECORD",
      legalEmployer: {
        name: run.companyName,
        registrationNumber: null,
        epfReference: null,
        socsoReference: null,
        eisReference: null,
        lhdnReference: null,
        representativeName: null,
      },
      employee: {
        id: line.employmentId,
        name: snap.name ?? "Unknown",
        code: snap.id ?? line.employmentId,
        designation: snap.designation ?? null,
        department: snap.department ?? null,
        maskedNric: maskNric(snap.ic),
        gender: snap.gender ?? null,
        citizenship: snap.citizenship ?? null,
        epfNumber: snap.epfNo ?? null,
        socsoNumber: snap.socsoNo ?? null,
        payBasis: snap.payBasis ?? null,
      },
      payPeriod: {
        reportingMonth,
        periodStart: run.periodStart,
        periodEnd: run.periodEnd,
        paymentDate: null,
        runId: run.id,
        label: run.id,
        workingDays: run.workingDays,
      },
      payment: {
        method: null,
        maskedBankAccount: maskBankAccount(snap.bankAccount),
        statementDate,
      },
      lineItems: items.map((item) => ({
        kind: item.kindSnap,
        codeSnap: item.itemCodeSnap,
        nameEnSnap: item.nameEnSnap,
        nameMsSnap: item.nameMsSnap,
        resolvedAmountSen: item.resolvedAmountSen,
        quantity: item.quantity,
        rateSen: item.rateSen,
      })),
      roots: buildRootsFromLine(line),
      statutoryWageBases: {
        epfWagesSen: line.epfWagesSen,
        socsoWagesSen: line.socsoWagesSen,
        eisWagesSen: line.eisWagesSen,
      },
      ytd,
      approval: {
        reviewedBy: run.reviewedBy,
        reviewedAt: run.reviewedAt?.toISOString() ?? null,
        approvedBy: run.approvedBy,
        approvedAt: run.approvedAt?.toISOString() ?? null,
        closedBy: run.closedBy,
        closedAt: run.closedAt?.toISOString() ?? null,
      },
      auditIdentity: {
        runId: run.id,
        calcRevision: run.calcRevision,
        rulePackId: run.rulePackId,
        rulePackHash: run.rulePackHash,
        calcEngineVersion: run.calcEngineVersion,
      },
    },
  };
}
