/**
 * @feature artifacts
 * @layer schema
 *
 * Hashed evidence / generated file store.
 *
 * Bytes live under `data/artifacts/`; the row is the audit fact. Evidence
 * enters only through `storeAttachedEvidence` — never by trusting a free-text
 * path. Nullable `runId` plus `entityType`/`entityId` so transfer letters are
 * not forced into a pay-run folder.
 */

import {
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { artifactEntityType, artifactSource, artifactType } from "./enums";
import { payRuns } from "./run";

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid().primaryKey().defaultRandom(),
    runId: text("run_id").references(() => payRuns.id),
    entityType: artifactEntityType("entity_type").notNull(),
    entityId: text("entity_id"),
    type: artifactType().notNull().default("EVIDENCE"),
    relativePath: text("relative_path").notNull(),
    sha256: text("sha256").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    mimeType: text("mime_type").notNull(),
    source: artifactSource().notNull().default("ATTACHED"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("artifacts_run").on(t.runId),
    index("artifacts_entity").on(t.entityType, t.entityId),
  ]
);

export type ArtifactRow = typeof artifacts.$inferSelect;
