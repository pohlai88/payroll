/**
 * Artifact metadata persistence — bytes live in ArtifactStore, not here.
 */

import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { ArtifactRow } from "@/db/schema/artifacts";
import { artifacts } from "@/db/schema/artifacts";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbOrTx = Database | Transaction;

export type { ArtifactRow } from "@/db/schema/artifacts";

export type ArtifactInsert = typeof artifacts.$inferInsert;

export async function insertArtifactRow(
  db: DbOrTx,
  row: ArtifactInsert
): Promise<void> {
  await db.insert(artifacts).values(row);
}

export async function listArtifactRowsByRunId(
  db: Database,
  runId: string
): Promise<ArtifactRow[]> {
  return await db.select().from(artifacts).where(eq(artifacts.runId, runId));
}

export async function getArtifactRowById(
  db: DbOrTx,
  artifactId: string
): Promise<ArtifactRow | null> {
  const [row] = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, artifactId))
    .limit(1);
  return row ?? null;
}
