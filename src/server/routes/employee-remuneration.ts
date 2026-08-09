/**
 * Phase 8 — annual remuneration summary read facade.
 * NOT Form EA / C.P.8A. See spec §5.3 and frozen Rule 4.
 *
 * GET /v1/employees/:employeeId/remuneration-summary/:year
 */
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { Database } from "@/db/client";
import { companies, employments } from "@/db/schema/parties";
import { payLines, payRuns } from "@/db/schema/run";
import { sumNullableSen } from "@/domain/sum-nullable-sen";
import { requirePermission } from "@/service/rbac";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";

const REPORT_SCHEMA_VERSION = "1.0";

const LIMITATION_NOTICE =
  "This summary aggregates payroll figures by reporting month, not by income receipt date. " +
  "Arrears, advance salary, late December payroll, and bonuses relating to prior periods may " +
  "require manual adjustment for annual income tax reporting purposes. " +
  "This is not a substitute for the official annual employer remuneration statement.";

const DISCLAIMER =
  "Annual remuneration summary prepared from payroll records in this system. " +
  "The employer must prepare and issue the annual remuneration statement to each employee " +
  "in accordance with the applicable statutory requirements and prescribed format.";

type PayLineRow = typeof payLines.$inferSelect;

function aggregateAnnualTotals(
  lines: PayLineRow[],
  eligibleRuns: { id: string; month: number }[],
  year: number,
  defaultEmployeeCode: string
) {
  let employeeName = "Unknown";
  let employeeCode = defaultEmployeeCode;

  for (const line of lines) {
    const snap = line.employeeSnapshot as { name?: string; id?: string };
    if (snap.name) {
      employeeName = snap.name;
    }
    if (snap.id) {
      employeeCode = snap.id;
    }
  }

  const gross = sumNullableSen(lines.map((l) => l.grossSen));
  const net = sumNullableSen(lines.map((l) => l.netSen));
  const epfEe = sumNullableSen(lines.map((l) => l.epfEeSen));
  const epfEr = sumNullableSen(lines.map((l) => l.epfErSen));
  const socsoEe = sumNullableSen(lines.map((l) => l.socsoEeCoreSen));
  const eisEe = sumNullableSen(lines.map((l) => l.eisEeSen));
  const pcb = sumNullableSen(lines.map((l) => l.pcbNetSen));
  const cp38 = sumNullableSen(lines.map((l) => l.cp38Sen));

  const runMonthMap = new Map(eligibleRuns.map((r) => [r.id, r.month]));
  const seenRunIds = new Set<string>();
  const seenMonths = new Set<number>();
  for (const line of lines) {
    seenRunIds.add(line.runId);
    const month = runMonthMap.get(line.runId);
    if (month !== undefined) {
      seenMonths.add(month);
    }
  }
  const months = [...seenMonths]
    .map((m) => `${year}-${String(m).padStart(2, "0")}`)
    .sort((a, b) => a.localeCompare(b));
  const runsIncluded = [...seenRunIds].sort((a, b) => a.localeCompare(b));

  return {
    grossSen: gross.sum,
    netSen: net.sum,
    epfEeSen: epfEe.sum,
    epfErSen: epfEr.sum,
    socsoEeCoreSen: socsoEe.sum,
    eisEeSen: eisEe.sum,
    pcbNetSen: pcb.sum,
    cp38Sen: cp38.sum,
    incomplete:
      gross.incomplete ||
      net.incomplete ||
      epfEe.incomplete ||
      epfEr.incomplete ||
      socsoEe.incomplete ||
      eisEe.incomplete ||
      pcb.incomplete ||
      cp38.incomplete,
    employeeName,
    employeeCode,
    months,
    runsIncluded,
  };
}

export function employeeRemunerationRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.get("/employees/:employeeId/remuneration-summary/:year", async (c) => {
    try {
      const employeeId = c.req.param("employeeId");
      const year = Number(c.req.param("year"));
      if (!Number.isInteger(year) || year < 2000 || year > 2999) {
        return c.json(
          { code: "VALIDATION_ERROR", message: "invalid year" },
          400
        );
      }

      const [employment] = await db
        .select({
          id: employments.id,
          companyId: employments.companyId,
          employeeCode: employments.employeeCode,
        })
        .from(employments)
        .where(eq(employments.id, employeeId))
        .limit(1);

      if (!employment) {
        return c.json(
          { code: "NOT_FOUND", message: `no such employee: ${employeeId}` },
          404
        );
      }

      const { companyId, employeeCode: employmentEmployeeCode } = employment;

      // Check user has REPORT READ permission on the employee's company
      await requirePermission(
        db,
        c.get("user").id,
        "REPORT",
        "READ",
        companyId
      );

      const [company] = await db
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      const eligibleRuns = await db
        .select({
          id: payRuns.id,
          month: payRuns.month,
          status: payRuns.status,
        })
        .from(payRuns)
        .where(
          and(
            eq(payRuns.companyId, companyId),
            eq(payRuns.year, year),
            inArray(payRuns.status, ["APPROVED", "CLOSED"])
          )
        );

      const eligibleRunIds = eligibleRuns.map((r) => r.id);

      let totals = {
        grossSen: 0,
        netSen: 0,
        epfEeSen: 0,
        epfErSen: 0,
        socsoEeCoreSen: 0,
        eisEeSen: 0,
        pcbNetSen: 0,
        cp38Sen: 0,
        incomplete: false,
        employeeName: "Unknown",
        employeeCode: employmentEmployeeCode,
        months: [] as string[],
        runsIncluded: [] as string[],
      };

      if (eligibleRunIds.length > 0) {
        const lines = await db
          .select()
          .from(payLines)
          .where(
            and(
              eq(payLines.employmentId, employeeId),
              inArray(payLines.runId, eligibleRunIds)
            )
          );

        totals = aggregateAnnualTotals(
          lines,
          eligibleRuns,
          year,
          employmentEmployeeCode
        );
      }

      return c.json({
        reportMeta: {
          companyId,
          companyName: company?.name ?? "Unknown",
          generatedAt: new Date().toISOString(),
          reportSchemaVersion: REPORT_SCHEMA_VERSION,
        },
        year,
        employeeId,
        employeeName: totals.employeeName,
        employeeCode: totals.employeeCode,
        runsIncluded: totals.runsIncluded,
        months: totals.months,
        grossSen: totals.grossSen,
        netSen: totals.netSen,
        epfEeSen: totals.epfEeSen,
        epfErSen: totals.epfErSen,
        socsoEeCoreSen: totals.socsoEeCoreSen,
        eisEeSen: totals.eisEeSen,
        pcbNetSen: totals.pcbNetSen,
        cp38Sen: totals.cp38Sen,
        incomplete: totals.incomplete,
        limitationNotice: LIMITATION_NOTICE,
        disclaimer: DISCLAIMER,
      });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
