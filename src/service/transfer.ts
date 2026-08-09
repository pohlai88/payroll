/**
 * @feature transfer
 * @layer service
 * @hub src/server/routes/transfers.ts
 *
 * Internal group transfer: ends an employment at one company and creates the
 * linked one at another, for the same person.
 *
 * HTTP: `POST /v1/transfers` via `commitTransferForActor`.
 * See `docs/superpowers/specs/2026-08-08-internal-group-transfer-design.md`.
 * Findings scan after commit via `scanTransferFindings`. Evidence attaches
 * only through `evidenceArtifactId` (hashed artifacts). Free-text `evidence_ref`
 * columns remain for historical rows but are no longer written.
 */

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { Database, Transaction } from "@/db/client";
import { employments, persons } from "@/db/schema/parties";
import { auditEvents, payRuns } from "@/db/schema/run";
import { employmentPriorYtd, transfers } from "@/db/schema/transfer";
import type { EpfPart, PayBasis, SocsoCategory } from "@/domain/calc/types";
import { parseIsoDate } from "@/domain/date";
import { requireArtifact } from "@/service/artifacts";
import { ControlError } from "@/service/control-errors";
import { scanTransferFindings } from "@/service/findings";
import { requirePermission } from "@/service/rbac";

export type GroupServiceContinuity = "CONTINUOUS" | "RESET";

export interface CommitTransferInput {
  readonly personId: string;
  readonly fromEmploymentId: string;
  readonly effectiveDate: string;
  readonly toCompanyId: string;
  readonly toEmployeeCode: string;
  readonly groupServiceContinuity: GroupServiceContinuity;
  /** Required, and only meaningful, when continuity is RESET. */
  readonly continuityReason?: string | null;
  readonly leaveBenefitTreatmentNote?: string | null;
  readonly allowOverlap?: boolean;
  /** Required when allowOverlap is true. */
  readonly overlapReason?: string | null;
  /** Hashed evidence via `storeAttachedEvidence` (TRANSFER or OTHER). */
  readonly evidenceArtifactId?: string | null;
  readonly actor: string;

  // Employment B's own terms. Omitted fields default from Employment A.
  readonly payBasis?: PayBasis;
  readonly baseRateSen?: number;
  readonly isMalaysian?: boolean;
  readonly isPermanentResident?: boolean;
  readonly epfApplicable?: boolean;
  readonly socsoApplicable?: boolean;
  readonly eisApplicable?: boolean;
  readonly pcbApplicable?: boolean;
  readonly epfMemberBeforeAug1998?: boolean | null;
  readonly eisPriorContribution?: boolean | null;
  readonly epfPartOverride?: EpfPart | null;
  readonly socsoCategoryOverride?: SocsoCategory | null;
  readonly epfNo?: string | null;
  readonly socsoNo?: string | null;
  readonly tin?: string | null;
  readonly bankName?: string | null;
  readonly bankAccountNo?: string | null;
  readonly bankAccountName?: string | null;
}

export interface CommitTransferResult {
  readonly transferId: string;
  readonly toEmploymentId: string;
}

type EmploymentRow = typeof employments.$inferSelect;

/**
 * Ends Employment A, creates Employment B, and links them — one transaction.
 *
 * The three business rules below are enforced here rather than as CHECK
 * constraints or triggers: two have a legitimate, explicit override, and this
 * codebase's trigger convention (`docs/architecture/payroll-architecture.md`
 * §2.7) reserves triggers for exception-less invariants.
 */
export interface TransferActor {
  readonly userId: string;
  readonly email: string;
}

/**
 * AuthZ over {@link commitTransfer}: EMPLOYMENT UPDATE on the source company
 * and EMPLOYMENT CREATE on the destination company.
 */
export async function commitTransferForActor(
  db: Database,
  actor: TransferActor,
  input: Omit<CommitTransferInput, "actor">
): Promise<CommitTransferResult> {
  const [from] = await db
    .select({ companyId: employments.companyId })
    .from(employments)
    .where(eq(employments.id, input.fromEmploymentId))
    .limit(1);
  if (from === undefined) {
    throw new ControlError(
      "NOT_FOUND",
      `no such employment: ${input.fromEmploymentId}`
    );
  }
  await requirePermission(
    db,
    actor.userId,
    "EMPLOYMENT",
    "UPDATE",
    from.companyId
  );
  await requirePermission(
    db,
    actor.userId,
    "EMPLOYMENT",
    "CREATE",
    input.toCompanyId
  );
  try {
    return await commitTransfer(db, { ...input, actor: actor.email });
  } catch (error) {
    throw mapTransferError(error);
  }
}

function mapTransferError(error: unknown): Error {
  if (error instanceof ControlError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("no such employment")) {
    return new ControlError("NOT_FOUND", message, undefined, { cause: error });
  }
  return new ControlError("VALIDATION_ERROR", message, undefined, {
    cause: error,
  });
}

export async function commitTransfer(
  db: Database,
  input: CommitTransferInput
): Promise<CommitTransferResult> {
  return await db.transaction(async (tx) => {
    const fromEmployment = await loadOpenEmployment(
      tx,
      input.fromEmploymentId,
      input.personId
    );

    await assertNoConcurrentEmployment(tx, input);
    await assertNotRetroactiveIntoLockedPeriod(tx, fromEmployment, input);
    await assertServiceDatesOrdered(tx, input);
    if (input.evidenceArtifactId) {
      const artifact = await requireArtifact(tx, input.evidenceArtifactId);
      if (
        artifact.entityType !== "TRANSFER" &&
        artifact.entityType !== "OTHER"
      ) {
        throw new Error(
          `artifact ${input.evidenceArtifactId} entityType ${artifact.entityType} cannot evidence a transfer`
        );
      }
    }

    const terminationDate = dayBefore(input.effectiveDate);

    await tx
      .update(employments)
      .set({
        terminationDate,
        terminationReason: "INTERNAL_GROUP_TRANSFER",
      })
      .where(eq(employments.id, fromEmployment.id));

    const [toEmployment] = await tx
      .insert(employments)
      .values(buildToEmploymentRow(fromEmployment, input))
      .returning({ id: employments.id });
    if (toEmployment === undefined) {
      throw new Error(
        `failed to create the receiving employment for transfer of person ${input.personId}`
      );
    }

    if (input.groupServiceContinuity === "RESET") {
      await tx
        .update(persons)
        .set({ groupServiceDate: input.effectiveDate })
        .where(eq(persons.id, input.personId));
    }

    const [transfer] = await tx
      .insert(transfers)
      .values({
        personId: input.personId,
        fromEmploymentId: fromEmployment.id,
        toEmploymentId: toEmployment.id,
        effectiveDate: input.effectiveDate,
        groupServiceContinuity: input.groupServiceContinuity,
        continuityReason: input.continuityReason ?? null,
        leaveBenefitTreatmentNote: input.leaveBenefitTreatmentNote ?? null,
        allowedOverlap: input.allowOverlap ?? false,
        overlapReason: input.overlapReason ?? null,
        evidenceRef: null,
        evidenceArtifactId: input.evidenceArtifactId ?? null,
        actor: input.actor,
      })
      .returning({ id: transfers.id });
    if (transfer === undefined) {
      throw new Error(
        `failed to insert the transfer record linking employment ${fromEmployment.id} to ${toEmployment.id}`
      );
    }

    await tx.insert(auditEvents).values({
      actor: input.actor,
      entity: "transfers",
      entityId: transfer.id,
      action: "CREATE",
      after: {
        personId: input.personId,
        fromEmploymentId: fromEmployment.id,
        toEmploymentId: toEmployment.id,
        effectiveDate: input.effectiveDate,
      },
    });

    await scanTransferFindings(tx, transfer.id, input.actor);

    return { transferId: transfer.id, toEmploymentId: toEmployment.id };
  });
}

async function loadOpenEmployment(
  tx: Transaction,
  employmentId: string,
  expectedPersonId: string
): Promise<EmploymentRow> {
  const [employment] = await tx
    .select()
    .from(employments)
    .where(eq(employments.id, employmentId))
    .limit(1);

  if (employment === undefined) {
    throw new Error(`no such employment: ${employmentId}`);
  }
  if (employment.personId !== expectedPersonId) {
    throw new Error(
      `employment ${employmentId} belongs to person ${employment.personId}, not ${expectedPersonId}`
    );
  }
  if (employment.terminationDate !== null) {
    throw new Error(
      `employment ${employmentId} already ended on ${employment.terminationDate}; a transfer can only end an open employment`
    );
  }
  return employment;
}

/**
 * A person should not hold two concurrently open employments unless the
 * transfer explicitly says so — a genuine secondment or dual role, not a
 * data-entry accident.
 */
async function assertNoConcurrentEmployment(
  tx: Transaction,
  input: CommitTransferInput
): Promise<void> {
  if (input.allowOverlap === true) {
    if (
      input.overlapReason === undefined ||
      input.overlapReason === null ||
      input.overlapReason.trim() === ""
    ) {
      throw new Error(
        "allowOverlap requires a non-blank overlapReason on the transfer"
      );
    }
    return;
  }

  const [other] = await tx
    .select({ id: employments.id })
    .from(employments)
    .where(
      and(
        eq(employments.personId, input.personId),
        ne(employments.id, input.fromEmploymentId),
        isNull(employments.terminationDate)
      )
    )
    .limit(1);

  if (other !== undefined) {
    throw new Error(
      `person ${input.personId} already has another open employment (${other.id}); ` +
        "pass allowOverlap and a reason if this is an intentional dual employment"
    );
  }
}

/**
 * A transfer cannot silently move a period an approved or closed regular run
 * already priced Employment A's full period against.
 */
async function assertNotRetroactiveIntoLockedPeriod(
  tx: Transaction,
  fromEmployment: EmploymentRow,
  input: CommitTransferInput
): Promise<void> {
  const terminationDate = dayBefore(input.effectiveDate);

  const [lockedRun] = await tx
    .select({
      id: payRuns.id,
      periodStart: payRuns.periodStart,
      periodEnd: payRuns.periodEnd,
    })
    .from(payRuns)
    .where(
      and(
        eq(payRuns.companyId, fromEmployment.companyId),
        eq(payRuns.runType, "REGULAR"),
        sql`${payRuns.status} IN ('APPROVED', 'CLOSED')`,
        sql`${payRuns.periodStart} <= ${terminationDate}`,
        sql`${payRuns.periodEnd} >= ${terminationDate}`
      )
    )
    .limit(1);

  if (lockedRun !== undefined) {
    throw new Error(
      `effective date ${input.effectiveDate} would end employment ${fromEmployment.id} inside ` +
        `${lockedRun.id} (${lockedRun.periodStart}..${lockedRun.periodEnd}), already ${"APPROVED/CLOSED"}; ` +
        "choose a later effective date or handle this via an off-cycle correction"
    );
  }
}

/** `groupServiceDate` may never postdate the receiving employment's join date. */
async function assertServiceDatesOrdered(
  tx: Transaction,
  input: CommitTransferInput
): Promise<void> {
  const [person] = await tx
    .select({ groupServiceDate: persons.groupServiceDate })
    .from(persons)
    .where(eq(persons.id, input.personId))
    .limit(1);

  if (person === undefined) {
    throw new Error(`no such person: ${input.personId}`);
  }

  const effectiveGroupServiceDate =
    input.groupServiceContinuity === "RESET"
      ? input.effectiveDate
      : person.groupServiceDate;

  if (
    effectiveGroupServiceDate !== null &&
    effectiveGroupServiceDate > input.effectiveDate
  ) {
    throw new Error(
      `groupServiceDate ${effectiveGroupServiceDate} would postdate the receiving employment's ` +
        `join date ${input.effectiveDate}`
    );
  }
}

function dayBefore(isoDate: string): string {
  const { y, m, d } = parseIsoDate(isoDate, "commitTransfer(effectiveDate)");
  const ms = Date.UTC(y, m - 1, d) - 24 * 60 * 60 * 1000;
  const prior = new Date(ms);
  return prior.toISOString().slice(0, 10);
}

function buildToEmploymentRow(
  fromEmployment: EmploymentRow,
  input: CommitTransferInput
): typeof employments.$inferInsert {
  return {
    personId: input.personId,
    companyId: input.toCompanyId,
    employeeCode: input.toEmployeeCode,
    joinDate: input.effectiveDate,
    priorEmploymentId: fromEmployment.id,
    payBasis: input.payBasis ?? fromEmployment.payBasis,
    baseRateSen: input.baseRateSen ?? fromEmployment.baseRateSen,
    isMalaysian: input.isMalaysian ?? fromEmployment.isMalaysian,
    isPermanentResident:
      input.isPermanentResident ?? fromEmployment.isPermanentResident,
    epfApplicable: input.epfApplicable ?? fromEmployment.epfApplicable,
    socsoApplicable: input.socsoApplicable ?? fromEmployment.socsoApplicable,
    eisApplicable: input.eisApplicable ?? fromEmployment.eisApplicable,
    pcbApplicable: input.pcbApplicable ?? fromEmployment.pcbApplicable,
    epfMemberBeforeAug1998:
      input.epfMemberBeforeAug1998 ?? fromEmployment.epfMemberBeforeAug1998,
    eisPriorContribution:
      input.eisPriorContribution ?? fromEmployment.eisPriorContribution,
    epfPartOverride: input.epfPartOverride ?? fromEmployment.epfPartOverride,
    socsoCategoryOverride:
      input.socsoCategoryOverride ?? fromEmployment.socsoCategoryOverride,
    epfNo: input.epfNo ?? null,
    socsoNo: input.socsoNo ?? null,
    tin: input.tin ?? fromEmployment.tin,
    bankName: input.bankName ?? fromEmployment.bankName,
    bankAccountNo: input.bankAccountNo ?? fromEmployment.bankAccountNo,
    bankAccountName: input.bankAccountName ?? fromEmployment.bankAccountName,
  };
}

export interface RecordPriorEmploymentYtdInput {
  readonly employmentId: string;
  readonly calendarYear: number;
  readonly grossSen?: number;
  readonly epfEeSen?: number;
  readonly epfErSen?: number;
  readonly socsoEeSen?: number;
  readonly socsoErSen?: number;
  readonly eisEeSen?: number;
  readonly eisErSen?: number;
  readonly pcbSen?: number;
  readonly zakatSen?: number;
  readonly verified?: boolean;
  readonly source?: string | null;
  /** Hashed evidence via `storeAttachedEvidence` (EMPLOYMENT_PRIOR_YTD or OTHER). */
  readonly evidenceArtifactId?: string | null;
  readonly enteredBy: string;
}

/**
 * Upserts one calendar-year row of the prior employer's figures for a
 * transferred employee. Independent of `commitTransfer`: this data is
 * typically entered once Company A's final payslip is issued, not
 * atomically with the transfer.
 */
export async function recordPriorEmploymentYtd(
  db: Database,
  input: RecordPriorEmploymentYtdInput
): Promise<void> {
  const now = new Date();
  const row: typeof employmentPriorYtd.$inferInsert = {
    employmentId: input.employmentId,
    calendarYear: input.calendarYear,
    grossSen: input.grossSen ?? 0,
    epfEeSen: input.epfEeSen ?? 0,
    epfErSen: input.epfErSen ?? 0,
    socsoEeSen: input.socsoEeSen ?? 0,
    socsoErSen: input.socsoErSen ?? 0,
    eisEeSen: input.eisEeSen ?? 0,
    eisErSen: input.eisErSen ?? 0,
    pcbSen: input.pcbSen ?? 0,
    zakatSen: input.zakatSen ?? 0,
    verified: input.verified ?? false,
    source: input.source ?? null,
    evidenceRef: null,
    evidenceArtifactId: input.evidenceArtifactId ?? null,
    enteredBy: input.enteredBy,
    enteredAt: now,
  };

  if (input.evidenceArtifactId) {
    const artifact = await requireArtifact(db, input.evidenceArtifactId);
    if (
      artifact.entityType !== "EMPLOYMENT_PRIOR_YTD" &&
      artifact.entityType !== "OTHER"
    ) {
      throw new Error(
        `artifact ${input.evidenceArtifactId} entityType ${artifact.entityType} cannot evidence prior YTD`
      );
    }
  }

  await db
    .insert(employmentPriorYtd)
    .values(row)
    .onConflictDoUpdate({
      target: [
        employmentPriorYtd.employmentId,
        employmentPriorYtd.calendarYear,
      ],
      set: row,
    });
}
