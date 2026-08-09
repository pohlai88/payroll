/**
 * Phase 8 — payslip read facade.
 * GET /v1/pay-runs/:runId/payslips         → index of lines for this run
 * GET /v1/pay-runs/:runId/lines/:lineId/payslip → full PayslipDocumentDto
 */
import { and, eq, inArray, lte } from "drizzle-orm";
import { Hono } from "hono";
import type { Database } from "@/db/client";
import { companies } from "@/db/schema/parties";
import { payLineItems, payLines, payRuns } from "@/db/schema/run";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";
import { requirePayRunAccess } from "./pay-run-access";

function maskNric(ic: string | null | undefined): string | null {
  if (!ic) {
    return null;
  }
  const digits = ic.replace(/\D/g, "");
  return digits.length >= 4 ? `****-**-${digits.slice(-4)}` : null;
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

function buildRootsRecord(
  line: typeof payLines.$inferSelect
): Record<string, { sen: number | null; notApplicable: boolean }> {
  return {
    gross: { sen: line.grossSen, notApplicable: false },
    epfWages: { sen: line.epfWagesSen, notApplicable: false },
    socsoWages: { sen: line.socsoWagesSen, notApplicable: false },
    eisWages: { sen: line.eisWagesSen, notApplicable: false },
    epfEe: { sen: line.epfEeSen, notApplicable: false },
    epfEr: { sen: line.epfErSen, notApplicable: false },
    socsoEeCore: { sen: line.socsoEeCoreSen, notApplicable: false },
    socsoEeSkbbk: { sen: line.socsoEeSkbbkSen, notApplicable: false },
    socsoEr: { sen: line.socsoErSen, notApplicable: false },
    eisEe: { sen: line.eisEeSen, notApplicable: false },
    eisEr: { sen: line.eisErSen, notApplicable: false },
    pcbNet: { sen: line.pcbNetSen, notApplicable: line.pcbNetSen === null },
    cp38: { sen: line.cp38Sen, notApplicable: false },
    zakat: { sen: line.zakatSen, notApplicable: false },
    otherDeductions: { sen: line.otherDeductionsSen, notApplicable: false },
    deductionsTotal: {
      sen: line.deductionsTotalSen,
      notApplicable: line.deductionsTotalSen === null,
    },
    net: { sen: line.netSen, notApplicable: line.netSen === null },
    hrdf: { sen: line.hrdfSen, notApplicable: false },
    employerCost: { sen: line.employerCostSen, notApplicable: false },
  };
}

export function payRunPayslipRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  // Index
  app.get("/pay-runs/:runId/payslips", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      const lines = await db
        .select({
          id: payLines.id,
          employeeSnapshot: payLines.employeeSnapshot,
          netSen: payLines.netSen,
        })
        .from(payLines)
        .where(eq(payLines.runId, runId));

      const payslips = lines.map((l) => {
        const snap = l.employeeSnapshot as { id?: string; name?: string };
        return {
          lineId: l.id,
          employeeCode: snap.id ?? l.id,
          employeeName: snap.name ?? "Unknown",
          netSen: l.netSen,
        };
      });
      return c.json({ payslips });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  // Full payslip DTO
  app.get("/pay-runs/:runId/lines/:lineId/payslip", async (c) => {
    try {
      const runId = c.req.param("runId");
      const lineId = c.req.param("lineId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);

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

      if (!run) {
        return c.json(
          { code: "NOT_FOUND", message: `no such run: ${runId}` },
          404
        );
      }

      const [line] = await db
        .select()
        .from(payLines)
        .where(and(eq(payLines.id, lineId), eq(payLines.runId, runId)))
        .limit(1);

      if (!line) {
        return c.json(
          { code: "NOT_FOUND", message: `no such line: ${lineId}` },
          404
        );
      }

      const items = await db
        .select()
        .from(payLineItems)
        .where(eq(payLineItems.lineId, lineId))
        .orderBy(payLineItems.sortSnap);

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

      // YTD: APPROVED + CLOSED runs for same company + employment + calendar year,
      // filtered to months <= this run's month so prior-period payslips are not inflated.
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

      let ytd: {
        grossSen: number;
        netSen: number;
        epfEeSen: number;
        epfErSen: number;
        socsoEeCoreSen: number;
        eisEeSen: number;
        pcbNetSen: number;
        cp38Sen: number;
        isProvisional: boolean;
      } | null = null;

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

        const sum = (key: keyof typeof payLines.$inferSelect) =>
          ytdLines.reduce(
            (acc, l) => acc + ((l[key] as number | null) ?? 0),
            0
          );

        const finalizedYtd = {
          grossSen: sum("grossSen"),
          netSen: sum("netSen"),
          epfEeSen: sum("epfEeSen"),
          epfErSen: sum("epfErSen"),
          socsoEeCoreSen: sum("socsoEeCoreSen"),
          eisEeSen: sum("eisEeSen"),
          pcbNetSen: sum("pcbNetSen"),
          cp38Sen: sum("cp38Sen"),
        };

        if (isProvisional) {
          ytd = {
            grossSen: finalizedYtd.grossSen + (line.grossSen ?? 0),
            netSen: finalizedYtd.netSen + (line.netSen ?? 0),
            epfEeSen: finalizedYtd.epfEeSen + (line.epfEeSen ?? 0),
            epfErSen: finalizedYtd.epfErSen + (line.epfErSen ?? 0),
            socsoEeCoreSen:
              finalizedYtd.socsoEeCoreSen + (line.socsoEeCoreSen ?? 0),
            eisEeSen: finalizedYtd.eisEeSen + (line.eisEeSen ?? 0),
            pcbNetSen: finalizedYtd.pcbNetSen + (line.pcbNetSen ?? 0),
            cp38Sen: finalizedYtd.cp38Sen + (line.cp38Sen ?? 0),
            isProvisional: true,
          };
        } else {
          ytd = { ...finalizedYtd, isProvisional: false };
        }
      }

      const dto = {
        documentId: `PSL-${runId}-${lineId}`,
        generatedAt: new Date().toISOString(),
        documentStatus: docStatus,
        employerSourceWarning: "LIVE_COMPANY_RECORD" as const,
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
        roots: buildRootsRecord(line),
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
      };

      return c.json(dto);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
