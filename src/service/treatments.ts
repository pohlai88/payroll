/**
 * Governed pay-item treatment / PCB class departures (MY-STAT-S06).
 * STATUTORY_DEFAULT rows come from seed/migration; this service writes
 * APPROVED_DEPARTURE supersessions only.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { payItems } from "@/db/schema/catalog";
import { auditEvents } from "@/db/schema/run";
import { payItemPcbClasses, payItemTreatments } from "@/db/schema/treatments";
import { ControlError } from "./control-errors";

export type TreatmentScheme = "EPF" | "SOCSO" | "EIS" | "HRD";
export type PcbRemunerationClass = "NORMAL" | "ADDITIONAL" | "EXCLUDED";

function assertDepartureActors(actor: string, approvedBy: string): void {
  if (actor.trim() === "" || approvedBy.trim() === "") {
    throw new ControlError(
      "VALIDATION_ERROR",
      "actor and approvedBy are required for APPROVED_DEPARTURE"
    );
  }
  if (actor.trim().toLowerCase() === approvedBy.trim().toLowerCase()) {
    throw new ControlError(
      "VALIDATION_ERROR",
      "approvedBy must differ from actor (same discipline as pay_line_overrides)"
    );
  }
}

export interface DepartWageTreatmentInput {
  readonly payItemId: string;
  readonly scheme: TreatmentScheme;
  readonly subject: boolean;
  readonly effectiveFrom: string;
  readonly reason: string;
  readonly actor: string;
  readonly approvedBy: string;
}

/**
 * Supersede the open treatment for (item, scheme) and insert an approved departure.
 */
export async function recordWageTreatmentDeparture(
  db: Database,
  input: DepartWageTreatmentInput
): Promise<{ id: string }> {
  assertDepartureActors(input.actor, input.approvedBy);
  if (input.reason.trim() === "") {
    throw new ControlError("VALIDATION_ERROR", "reason is required");
  }

  const [item] = await db
    .select({ id: payItems.id, isSystem: payItems.isSystem })
    .from(payItems)
    .where(eq(payItems.id, input.payItemId))
    .limit(1);
  if (item === undefined) {
    throw new ControlError("NOT_FOUND", `no such pay item: ${input.payItemId}`);
  }
  if (item.isSystem) {
    throw new ControlError(
      "INVALID_STATE",
      "system pay items cannot change statutory treatment via departure"
    );
  }

  return await db.transaction(async (tx) => {
    // Close any open-ended row that would overlap the new effective_from.
    await tx
      .update(payItemTreatments)
      .set({
        effectiveTo: sql`(${input.effectiveFrom}::date - 1)`,
      })
      .where(
        and(
          eq(payItemTreatments.payItemId, input.payItemId),
          eq(payItemTreatments.scheme, input.scheme),
          isNull(payItemTreatments.effectiveTo),
          sql`${payItemTreatments.effectiveFrom} < ${input.effectiveFrom}::date`
        )
      );

    const [row] = await tx
      .insert(payItemTreatments)
      .values({
        payItemId: input.payItemId,
        scheme: input.scheme,
        subject: input.subject,
        source: "APPROVED_DEPARTURE",
        effectiveFrom: input.effectiveFrom,
        reason: input.reason.trim(),
        approvedBy: input.approvedBy.trim(),
        approvedAt: new Date(),
        actor: input.actor.trim(),
      })
      .returning({ id: payItemTreatments.id });

    if (row === undefined) {
      throw new ControlError(
        "VALIDATION_ERROR",
        "failed to insert pay_item_treatments departure"
      );
    }

    await tx.insert(auditEvents).values({
      actor: input.actor,
      entity: "pay_item_treatments",
      entityId: row.id,
      action: "APPROVED_DEPARTURE",
      after: {
        payItemId: input.payItemId,
        scheme: input.scheme,
        subject: input.subject,
        approvedBy: input.approvedBy,
      },
    });

    return row;
  });
}

export interface DepartPcbClassInput {
  readonly payItemId: string;
  readonly class: PcbRemunerationClass;
  readonly effectiveFrom: string;
  readonly reason: string;
  readonly actor: string;
  readonly approvedBy: string;
}

export async function recordPcbClassDeparture(
  db: Database,
  input: DepartPcbClassInput
): Promise<{ id: string }> {
  assertDepartureActors(input.actor, input.approvedBy);
  if (input.reason.trim() === "") {
    throw new ControlError("VALIDATION_ERROR", "reason is required");
  }

  const [item] = await db
    .select({ id: payItems.id })
    .from(payItems)
    .where(eq(payItems.id, input.payItemId))
    .limit(1);
  if (item === undefined) {
    throw new ControlError("NOT_FOUND", `no such pay item: ${input.payItemId}`);
  }

  return await db.transaction(async (tx) => {
    await tx
      .update(payItemPcbClasses)
      .set({
        effectiveTo: sql`(${input.effectiveFrom}::date - 1)`,
      })
      .where(
        and(
          eq(payItemPcbClasses.payItemId, input.payItemId),
          isNull(payItemPcbClasses.effectiveTo),
          sql`${payItemPcbClasses.effectiveFrom} < ${input.effectiveFrom}::date`
        )
      );

    const [row] = await tx
      .insert(payItemPcbClasses)
      .values({
        payItemId: input.payItemId,
        class: input.class,
        source: "APPROVED_DEPARTURE",
        effectiveFrom: input.effectiveFrom,
        reason: input.reason.trim(),
        approvedBy: input.approvedBy.trim(),
        approvedAt: new Date(),
        actor: input.actor.trim(),
      })
      .returning({ id: payItemPcbClasses.id });

    if (row === undefined) {
      throw new ControlError(
        "VALIDATION_ERROR",
        "failed to insert pay_item_pcb_classes departure"
      );
    }

    await tx.insert(auditEvents).values({
      actor: input.actor,
      entity: "pay_item_pcb_classes",
      entityId: row.id,
      action: "APPROVED_DEPARTURE",
      after: {
        payItemId: input.payItemId,
        class: input.class,
        approvedBy: input.approvedBy,
      },
    });

    return row;
  });
}
