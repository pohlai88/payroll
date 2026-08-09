/**
 * @feature reports
 * @layer route
 * @surface GET /v1/pay-runs/:runId/reports/payment-register|statutory-summary|exception-report
 * @chain
 *   ui:      src/web/reports/reports-page.tsx; payment-register.tsx; statutory-summary.tsx; exception-report.tsx
 *   client:  getPaymentRegister, getStatutorySummary, getExceptionReport
 *   route:   src/server/routes/pay-run-reports.ts
 *   service: (none — fat route + drizzle)
 *   repo:    (none — SQL in route)
 *   schema:  src/db/schema/run.ts; control.ts; findings.ts; parties.ts
 *   spine:   app.ts → payRunReportRoutes; app.tsx + app-nav /reports
 *
 * Run-scoped report facades (fat-route; extract service when touching).
 */
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Database } from "@/db/client";
import { linePayments } from "@/db/schema/control";
import { anomalyFindings } from "@/db/schema/findings";
import { companies } from "@/db/schema/parties";
import { payLines, payRuns } from "@/db/schema/run";
import { sumNullableSen } from "@/domain/sum-nullable-sen";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";
import { requirePayRunAccess } from "./pay-run-access";

const REPORT_SCHEMA_VERSION = "1.0";

async function getRunMeta(db: Database, runId: string) {
  const [run] = await db
    .select({
      id: payRuns.id,
      companyId: payRuns.companyId,
      status: payRuns.status,
      calcRevision: payRuns.calcRevision,
      companyName: companies.name,
    })
    .from(payRuns)
    .innerJoin(companies, eq(payRuns.companyId, companies.id))
    .where(eq(payRuns.id, runId))
    .limit(1);
  return run ?? null;
}

function maskBankAccount(acct: string | undefined): string | null {
  if (!acct) {
    return null;
  }
  return acct.length > 4 ? `****${acct.slice(-4)}` : "****";
}

function buildMeta(run: NonNullable<Awaited<ReturnType<typeof getRunMeta>>>) {
  return {
    companyId: run.companyId,
    companyName: run.companyName,
    runId: run.id,
    runStatus: run.status,
    calcRevision: run.calcRevision ?? null,
    generatedAt: new Date().toISOString(),
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
  };
}

export function payRunReportRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  // ── Payment Register ──────────────────────────────────────────────────────
  app.get("/pay-runs/:runId/reports/payment-register", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      const run = await getRunMeta(db, runId);
      if (!run) {
        return c.json(
          { code: "NOT_FOUND", message: `no such run: ${runId}` },
          404
        );
      }

      const rows = await db
        .select({
          lineId: payLines.id,
          employmentId: payLines.employmentId,
          employeeSnapshot: payLines.employeeSnapshot,
          netSen: payLines.netSen,
          paymentState: linePayments.state,
          paymentRef: linePayments.paymentRef,
        })
        .from(payLines)
        .leftJoin(linePayments, eq(linePayments.lineId, payLines.id))
        .where(eq(payLines.runId, runId));

      const mapped = rows.map((r) => {
        const snap = r.employeeSnapshot as {
          id?: string;
          name?: string;
          bankAccount?: string;
        };
        const acct = snap.bankAccount;
        return {
          lineId: r.lineId,
          employeeCode: snap.id ?? r.employmentId,
          employeeName: snap.name ?? "Unknown",
          netSen: r.netSen,
          paymentState: r.paymentState ?? null,
          paymentRef: r.paymentRef ?? null,
          maskedBankAccount: maskBankAccount(acct),
        };
      });

      const netAgg = sumNullableSen(mapped.map((r) => r.netSen));

      return c.json({
        reportMeta: buildMeta(run),
        rows: mapped,
        totalNetSen: netAgg.sum,
        incomplete: netAgg.incomplete,
      });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  // ── Statutory Summary ─────────────────────────────────────────────────────
  app.get("/pay-runs/:runId/reports/statutory-summary", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      const run = await getRunMeta(db, runId);
      if (!run) {
        return c.json(
          { code: "NOT_FOUND", message: `no such run: ${runId}` },
          404
        );
      }

      const lines = await db
        .select()
        .from(payLines)
        .where(eq(payLines.runId, runId));
      const sumField = (key: keyof (typeof lines)[number]) =>
        sumNullableSen(lines.map((l) => l[key] as number | null));
      const gross = sumField("grossSen");
      const net = sumField("netSen");
      const epfEe = sumField("epfEeSen");
      const epfEr = sumField("epfErSen");
      const socsoEe = sumField("socsoEeCoreSen");
      const socsoEr = sumField("socsoErSen");
      const eisEe = sumField("eisEeSen");
      const eisEr = sumField("eisErSen");
      const pcb = sumField("pcbNetSen");
      const cp38 = sumField("cp38Sen");

      return c.json({
        reportMeta: buildMeta(run),
        employeeCount: lines.length,
        grossTotalSen: gross.sum,
        netTotalSen: net.sum,
        epfEeTotalSen: epfEe.sum,
        epfErTotalSen: epfEr.sum,
        socsoEeCoreTotalSen: socsoEe.sum,
        socsoErTotalSen: socsoEr.sum,
        eisEeTotalSen: eisEe.sum,
        eisErTotalSen: eisEr.sum,
        pcbNetTotalSen: pcb.sum,
        cp38TotalSen: cp38.sum,
        incomplete:
          gross.incomplete ||
          net.incomplete ||
          epfEe.incomplete ||
          epfEr.incomplete ||
          socsoEe.incomplete ||
          socsoEr.incomplete ||
          eisEe.incomplete ||
          eisEr.incomplete ||
          pcb.incomplete ||
          cp38.incomplete,
      });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  // ── Exception Report ──────────────────────────────────────────────────────
  app.get("/pay-runs/:runId/reports/exception-report", async (c) => {
    try {
      const runId = c.req.param("runId");
      await requirePayRunAccess(db, c.get("user").id, "READ", runId);
      const run = await getRunMeta(db, runId);
      if (!run) {
        return c.json(
          { code: "NOT_FOUND", message: `no such run: ${runId}` },
          404
        );
      }

      const findings = await db
        .select({
          id: anomalyFindings.id,
          severity: anomalyFindings.severity,
          status: anomalyFindings.status,
          title: anomalyFindings.title,
          detail: anomalyFindings.detail,
          lineId: anomalyFindings.lineId,
        })
        .from(anomalyFindings)
        .where(eq(anomalyFindings.runId, runId));

      const lineIds = [
        ...new Set(findings.map((f) => f.lineId).filter(Boolean)),
      ] as string[];
      const nameMap = new Map<string, string>();
      if (lineIds.length > 0) {
        const lines = await db
          .select({
            id: payLines.id,
            employeeSnapshot: payLines.employeeSnapshot,
          })
          .from(payLines)
          .where(eq(payLines.runId, runId));
        for (const l of lines) {
          const snap = l.employeeSnapshot as { name?: string };
          nameMap.set(l.id, snap.name ?? "Unknown");
        }
      }

      return c.json({
        reportMeta: buildMeta(run),
        findings: findings.map((f) => ({
          id: f.id,
          severity: f.severity,
          status: f.status,
          title: f.title,
          detail: f.detail,
          lineId: f.lineId ?? null,
          employeeName: f.lineId ? (nameMap.get(f.lineId) ?? null) : null,
        })),
      });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
