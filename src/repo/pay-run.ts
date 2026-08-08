/**
 * Loads a run's lines as engine input.
 *
 * This is the only place that assembles `EmployeeSnapshot` and `LineInputs` from
 * stored rows. Everything downstream — the service layer, and eventually the API
 * — receives the engine's own types, which is what keeps `src/domain` free of
 * any knowledge that a database exists.
 */

import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import {
  payLineItems,
  payLineOverrides,
  payLines,
  payRuns,
  pcbEntries,
} from "@/db/schema/run";
import type {
  EmployeeSnapshot,
  LineInputs,
  LineItemInput,
  OverrideInput,
  PcbInput,
} from "@/domain/calc/types";

/**
 * The snapshot is jsonb, so the database cannot vouch for its shape. It was
 * written by `createRun` from typed columns, but a run may be read back years
 * later — after a schema change, a restore, or an import — and a silently
 * malformed snapshot would reach the engine as `undefined` fields.
 */
const employeeSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  isMalaysian: z.boolean(),
  isPermanentResident: z.boolean(),
  dob: z.string().nullable(),
  payBasis: z.enum(["MONTHLY", "DAILY", "HOURLY"]),
  baseRateSen: z.number().int(),
  epfApplicable: z.boolean(),
  socsoApplicable: z.boolean(),
  eisApplicable: z.boolean(),
  pcbApplicable: z.boolean(),
  epfMemberBeforeAug1998: z.boolean().nullable(),
  eisPriorContribution: z.boolean().nullable(),
  epfPartOverride: z.enum(["A", "C", "E", "F", "NONE"]).nullable(),
  socsoCategoryOverride: z.enum(["FIRST", "SECOND", "NONE"]).nullable(),
});

export interface LineForCompute {
  readonly lineId: string;
  readonly employmentId: string;
  readonly employee: EmployeeSnapshot;
  readonly inputs: LineInputs;
  readonly overrides: OverrideInput[];
  readonly pcb: PcbInput | null;
}

export interface RunForCompute {
  readonly runId: string;
  readonly rulePackId: string;
  readonly status: string;
  readonly lines: LineForCompute[];
}

/** Postgres returns numeric as a string to preserve precision; inputs are numbers. */
function toNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

export async function loadRunForCompute(
  db: Database,
  runId: string
): Promise<RunForCompute> {
  const [run] = await db
    .select({
      id: payRuns.id,
      rulePackId: payRuns.rulePackId,
      status: payRuns.status,
    })
    .from(payRuns)
    .where(eq(payRuns.id, runId))
    .limit(1);

  if (run === undefined) {
    throw new Error(`no such pay run: ${runId}`);
  }

  const lineRows = await db
    .select({
      id: payLines.id,
      employmentId: payLines.employmentId,
      employeeSnapshot: payLines.employeeSnapshot,
      workingDays: payLines.workingDays,
      paidDays: payLines.paidDays,
      hoursWorked: payLines.hoursWorked,
      periodEnd: payLines.periodEnd,
    })
    .from(payLines)
    .where(eq(payLines.runId, runId))
    .orderBy(asc(payLines.id));

  const lines: LineForCompute[] = [];
  for (const row of lineRows) {
    const [items, overrides, pcb] = await Promise.all([
      loadLineItems(db, row.id),
      loadOverrides(db, row.id),
      loadPcb(db, row.id),
    ]);

    const snapshot = employeeSnapshotSchema.safeParse(row.employeeSnapshot);
    if (!snapshot.success) {
      throw new Error(
        `line ${row.id} has a malformed employee snapshot: ` +
          snapshot.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")
      );
    }

    lines.push({
      lineId: row.id,
      employmentId: row.employmentId,
      employee: snapshot.data,
      inputs: {
        workingDays: row.workingDays,
        paidDays: toNumber(row.paidDays),
        hoursWorked: toNumber(row.hoursWorked),
        items,
        periodEnd: row.periodEnd,
      },
      overrides,
      pcb,
    });
  }

  return {
    runId: run.id,
    rulePackId: run.rulePackId,
    status: run.status,
    lines,
  };
}

/**
 * Items come back from the frozen `_snap` columns, never from the live catalog.
 * The stored basis is what the entry was made against, and the engine rejects an
 * entry whose basis disagrees with the definition in force — which is exactly
 * how a catalog change is prevented from reinterpreting a past run.
 */
async function loadLineItems(
  db: Database,
  lineId: string
): Promise<LineItemInput[]> {
  const rows = await db
    .select({
      itemCodeSnap: payLineItems.itemCodeSnap,
      basisSnap: payLineItems.basisSnap,
      quantity: payLineItems.quantity,
      rateSen: payLineItems.rateSen,
      amountSen: payLineItems.amountSen,
    })
    .from(payLineItems)
    .where(eq(payLineItems.lineId, lineId))
    .orderBy(asc(payLineItems.sortSnap), asc(payLineItems.itemCodeSnap));

  return rows.map((row) => {
    if (
      row.basisSnap === "PER_DAY" ||
      row.basisSnap === "PER_HOUR" ||
      row.basisSnap === "PER_UNIT"
    ) {
      if (row.quantity === null || row.rateSen === null) {
        throw new Error(
          `line item ${row.itemCodeSnap} is ${row.basisSnap} but has no quantity or rate`
        );
      }
      return {
        payItemCode: row.itemCodeSnap,
        basis: row.basisSnap,
        qty: Number(row.quantity),
        rateSen: row.rateSen,
      };
    }
    if (row.amountSen === null) {
      throw new Error(
        `line item ${row.itemCodeSnap} is ${row.basisSnap} but has no amount`
      );
    }
    return {
      payItemCode: row.itemCodeSnap,
      basis: row.basisSnap,
      amountSen: row.amountSen,
    };
  });
}

async function loadOverrides(
  db: Database,
  lineId: string
): Promise<OverrideInput[]> {
  const rows = await db
    .select({
      field: payLineOverrides.field,
      overrideSen: payLineOverrides.overrideSen,
    })
    .from(payLineOverrides)
    .where(eq(payLineOverrides.lineId, lineId))
    .orderBy(asc(payLineOverrides.field));
  return rows;
}

/**
 * A missing row means PCB was never entered, which is not the same as zero: the
 * engine renders net pay as unknown rather than inventing a figure.
 */
async function loadPcb(db: Database, lineId: string): Promise<PcbInput | null> {
  const [row] = await db
    .select({
      pcbAmountSen: pcbEntries.pcbAmountSen,
      cp38Sen: pcbEntries.cp38Sen,
      zakatOffsetSen: pcbEntries.zakatOffsetSen,
      verified: pcbEntries.verified,
    })
    .from(pcbEntries)
    .where(eq(pcbEntries.lineId, lineId))
    .limit(1);

  if (row === undefined) {
    return null;
  }
  return {
    pcbAmountSen: row.pcbAmountSen,
    cp38Sen: row.cp38Sen,
    zakatOffsetSen: row.zakatOffsetSen,
    verified: row.verified,
  };
}
