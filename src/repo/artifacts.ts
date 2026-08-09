/**
 * @feature artifacts
 * @layer repo
 * @hub src/server/routes/pay-run-control.ts
 *
 * Artifact metadata persistence — bytes live in ArtifactStore, not here.
 */

import { eq } from "drizzle-orm";
import type { Database, DbOrTx } from "@/db/client";
import type { ArtifactRow } from "@/db/schema/artifacts";
import { artifacts } from "@/db/schema/artifacts";

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
