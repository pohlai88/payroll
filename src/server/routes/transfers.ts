import { Hono } from "hono";
import { z } from "zod";
import type { Database } from "@/db/client";
import { commitTransferForActor } from "@/service/transfer";
import type { AuthVariables } from "../auth/middleware";
import { handleRouteError } from "../errors";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const commitTransferBody = z.object({
  personId: z.string().uuid(),
  fromEmploymentId: z.string().uuid(),
  effectiveDate: isoDate,
  toCompanyId: z.string().uuid(),
  toEmployeeCode: z.string().min(1),
  groupServiceContinuity: z.enum(["CONTINUOUS", "RESET"]),
  continuityReason: z.string().nullable().optional(),
  leaveBenefitTreatmentNote: z.string().nullable().optional(),
  allowOverlap: z.boolean().optional(),
  overlapReason: z.string().nullable().optional(),
  evidenceArtifactId: z.string().uuid().nullable().optional(),
  payBasis: z.enum(["MONTHLY", "DAILY", "HOURLY"]).optional(),
  baseRateSen: z.number().int().nonnegative().optional(),
  isMalaysian: z.boolean().optional(),
  isPermanentResident: z.boolean().optional(),
  epfApplicable: z.boolean().optional(),
  socsoApplicable: z.boolean().optional(),
  eisApplicable: z.boolean().optional(),
  pcbApplicable: z.boolean().optional(),
  epfMemberBeforeAug1998: z.boolean().nullable().optional(),
  eisPriorContribution: z.boolean().nullable().optional(),
  epfPartOverride: z.enum(["A", "C", "E", "F", "NONE"]).nullable().optional(),
  socsoCategoryOverride: z
    .enum(["FIRST", "SECOND", "NONE"])
    .nullable()
    .optional(),
  epfNo: z.string().nullable().optional(),
  socsoNo: z.string().nullable().optional(),
  tin: z.string().nullable().optional(),
  bankName: z.string().nullable().optional(),
  bankAccountNo: z.string().nullable().optional(),
  bankAccountName: z.string().nullable().optional(),
});

export function transferRoutes(db: Database) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.post("/transfers", async (c) => {
    try {
      const user = c.get("user");
      const body = commitTransferBody.parse(await c.req.json());
      const result = await commitTransferForActor(
        db,
        { userId: user.id, email: user.email },
        body
      );
      return c.json(result, 201);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
