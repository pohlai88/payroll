/**
 * Issuing and verifying closure seals.
 *
 * Issuance happens inside the closing transaction, so a run can never be
 * CLOSED without a seal. Verification is deliberately paranoid: it recomputes
 * every hash and re-reads the run and the manifest artifact rather than
 * trusting the seal row, because the failure it exists to catch is precisely
 * one where the stored rows disagree with each other.
 */

import { asc, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { artifacts } from "@/db/schema/artifacts";
import { payRuns } from "@/db/schema/run";
import { closureSeals } from "@/db/schema/seal";
import { computeSealHash, SEAL_VERSION } from "@/domain/seal/closure-seal";
import { ControlError } from "./control-errors";

/** Any Drizzle handle: the pool, or a transaction inside `closeRun`. */
type Executor =
  | Database
  | Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface IssuedSeal {
  readonly sequence: number;
  readonly sealHash: string;
  readonly previousSealHash: string | null;
  readonly manifestSha256: string;
  readonly sealVersion: string;
  readonly closedAt: string;
  readonly closedBy: string;
}

export interface IssueClosureSealInput {
  readonly runId: string;
  readonly companyId: string;
  readonly manifestArtifactId: string;
  readonly manifestSha256: string;
  readonly calcRevision: string | null;
  readonly approvedRevision: string | null;
  readonly closedAt: Date;
  readonly closedBy: string;
}

/**
 * Two runs of the same company closing at once would otherwise read the same
 * chain tip and race for `sequence`. A transaction-scoped advisory lock keyed
 * on the company serialises them; it is released when the transaction ends,
 * committed or not.
 */
async function lockCompanyChain(
  tx: Executor,
  companyId: string
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${companyId}, 0))`
  );
}

export async function issueClosureSeal(
  tx: Executor,
  input: IssueClosureSealInput
): Promise<IssuedSeal> {
  await lockCompanyChain(tx, input.companyId);

  const [tip] = await tx
    .select({
      sequence: closureSeals.sequence,
      sealHash: closureSeals.sealHash,
    })
    .from(closureSeals)
    .where(eq(closureSeals.companyId, input.companyId))
    .orderBy(sql`${closureSeals.sequence} DESC`)
    .limit(1);

  const sequence = (tip?.sequence ?? 0) + 1;
  const previousSealHash = tip?.sealHash ?? null;
  const closedAt = input.closedAt.toISOString();

  const sealHash = computeSealHash({
    runId: input.runId,
    companyId: input.companyId,
    sequence,
    manifestSha256: input.manifestSha256,
    calcRevision: input.calcRevision,
    approvedRevision: input.approvedRevision,
    closedAt,
    closedBy: input.closedBy,
    previousSealHash,
  });

  await tx.insert(closureSeals).values({
    runId: input.runId,
    companyId: input.companyId,
    sequence,
    manifestSha256: input.manifestSha256,
    manifestArtifactId: input.manifestArtifactId,
    calcRevision: input.calcRevision,
    approvedRevision: input.approvedRevision,
    closedAt: input.closedAt,
    closedBy: input.closedBy,
    previousSealHash,
    sealHash,
    sealVersion: SEAL_VERSION,
  });

  return {
    sequence,
    sealHash,
    previousSealHash,
    manifestSha256: input.manifestSha256,
    sealVersion: SEAL_VERSION,
    closedAt,
    closedBy: input.closedBy,
  };
}

export interface SealStatus {
  readonly runId: string;
  readonly sequence: number;
  readonly sealHash: string;
  readonly previousSealHash: string | null;
  readonly manifestSha256: string;
  readonly manifestArtifactId: string;
  readonly closedAt: string;
  readonly closedBy: string;
  readonly sealVersion: string;
  readonly ok: boolean;
  /** Empty when `ok`. Each entry names one disagreement, in plain words. */
  readonly problems: readonly string[];
}

export interface ChainVerification {
  readonly companyId: string;
  readonly length: number;
  readonly ok: boolean;
  readonly seals: readonly SealStatus[];
}

interface RunFacts {
  readonly calcRevision: string | null;
  readonly approvedRevision: string | null;
  readonly closedAt: Date | null;
  readonly closedBy: string | null;
  readonly closedManifestArtifactId: string | null;
  readonly status: string;
}

function checkSeal(
  row: typeof closureSeals.$inferSelect,
  expectedPrevious: string | null,
  run: RunFacts | undefined,
  manifestSha256: string | undefined
): readonly string[] {
  const problems: string[] = [];

  const recomputed = computeSealHash({
    runId: row.runId,
    companyId: row.companyId,
    sequence: row.sequence,
    manifestSha256: row.manifestSha256,
    calcRevision: row.calcRevision,
    approvedRevision: row.approvedRevision,
    closedAt: row.closedAt.toISOString(),
    closedBy: row.closedBy,
    previousSealHash: row.previousSealHash,
  });
  if (row.sealVersion !== SEAL_VERSION) {
    problems.push(
      `seal was issued as ${row.sealVersion}, this build verifies ${SEAL_VERSION}`
    );
  } else if (recomputed !== row.sealHash) {
    problems.push("seal hash does not match the fields it was computed from");
  }

  if (row.previousSealHash !== expectedPrevious) {
    problems.push(
      expectedPrevious === null
        ? "links to a previous seal but is first in the chain"
        : "does not link to the seal before it"
    );
  }

  if (run === undefined) {
    problems.push("the sealed run no longer exists");
    return problems;
  }
  if (run.status !== "CLOSED") {
    problems.push(`the sealed run is ${run.status}, not CLOSED`);
  }
  if (
    run.closedAt === null ||
    run.closedAt.getTime() !== row.closedAt.getTime()
  ) {
    problems.push("closedAt on the run differs from the seal");
  }
  if (run.closedBy !== row.closedBy) {
    problems.push("closedBy on the run differs from the seal");
  }
  if (run.calcRevision !== row.calcRevision) {
    problems.push("calcRevision on the run differs from the seal");
  }
  if (run.approvedRevision !== row.approvedRevision) {
    problems.push("approvedRevision on the run differs from the seal");
  }
  if (run.closedManifestArtifactId !== row.manifestArtifactId) {
    problems.push("the run points at a different manifest than the seal");
  }

  if (manifestSha256 === undefined) {
    problems.push("the sealed manifest artifact no longer exists");
  } else if (manifestSha256 !== row.manifestSha256) {
    problems.push("the manifest's sha256 differs from the seal");
  }

  return problems;
}

export async function verifyClosureChain(
  db: Database,
  companyId: string
): Promise<ChainVerification> {
  const rows = await db
    .select()
    .from(closureSeals)
    .where(eq(closureSeals.companyId, companyId))
    .orderBy(asc(closureSeals.sequence));

  const seals: SealStatus[] = [];
  let expectedPrevious: string | null = null;

  for (const row of rows) {
    const [run] = await db
      .select({
        calcRevision: payRuns.calcRevision,
        approvedRevision: payRuns.approvedRevision,
        closedAt: payRuns.closedAt,
        closedBy: payRuns.closedBy,
        closedManifestArtifactId: payRuns.closedManifestArtifactId,
        status: payRuns.status,
      })
      .from(payRuns)
      .where(eq(payRuns.id, row.runId))
      .limit(1);

    const [manifest] = await db
      .select({ sha256: artifacts.sha256 })
      .from(artifacts)
      .where(eq(artifacts.id, row.manifestArtifactId))
      .limit(1);

    const problems = checkSeal(row, expectedPrevious, run, manifest?.sha256);

    seals.push({
      runId: row.runId,
      sequence: row.sequence,
      sealHash: row.sealHash,
      previousSealHash: row.previousSealHash,
      manifestSha256: row.manifestSha256,
      manifestArtifactId: row.manifestArtifactId,
      closedAt: row.closedAt.toISOString(),
      closedBy: row.closedBy,
      sealVersion: row.sealVersion,
      ok: problems.length === 0,
      problems,
    });

    expectedPrevious = row.sealHash;
  }

  return {
    companyId,
    length: seals.length,
    ok: seals.every((s) => s.ok),
    seals,
  };
}

export interface RunSeal extends SealStatus {
  readonly companyId: string;
  /** How many closures this company has sealed in total. */
  readonly chainLength: number;
  /** Whether the whole company chain verifies, not just this seal. */
  readonly chainOk: boolean;
}

/** Null when the run has never been closed. Throws only if the run is unknown. */
export async function getRunSeal(
  db: Database,
  runId: string
): Promise<RunSeal | null> {
  const [row] = await db
    .select({ companyId: closureSeals.companyId })
    .from(closureSeals)
    .where(eq(closureSeals.runId, runId))
    .limit(1);
  if (row === undefined) {
    return null;
  }

  const chain = await verifyClosureChain(db, row.companyId);
  const seal = chain.seals.find((s) => s.runId === runId);
  if (seal === undefined) {
    throw new ControlError(
      "NOT_FOUND",
      `seal for ${runId} vanished mid-verification`
    );
  }

  return {
    ...seal,
    companyId: row.companyId,
    chainLength: chain.length,
    chainOk: chain.ok,
  };
}
