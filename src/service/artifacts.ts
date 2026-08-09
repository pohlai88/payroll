/**
 * Store hashed artifacts in R2 (or injectable store) and persist metadata.
 * Run-scoped HTTP entrypoints use *ForActor (PAY_RUN RBAC). Internal writers
 * (release/close/timestamp) call storeArtifact without AuthZ.
 */

import { createHash, randomUUID } from "node:crypto";
import type { Database, DbOrTx } from "@/db/client";
import type { ArtifactRow } from "@/db/schema/artifacts";
import {
  filenameFromArtifactKey,
  sanitizeArtifactFilename,
} from "@/domain/artifacts/keys";
import { LocalFsArtifactStore } from "@/domain/artifacts/local-fs-store";
import {
  ARTIFACT_MAX_BODY_BYTES,
  type ArtifactStore,
} from "@/domain/artifacts/store";
import {
  getArtifactRowById,
  insertArtifactRow,
  listArtifactRowsByRunId,
} from "@/repo/artifacts";
import { requirePayRunPermission } from "@/service/payrun";
import { ControlError } from "./control-errors";

export { ARTIFACT_MAX_BODY_BYTES } from "@/domain/artifacts/store";

export type ArtifactType =
  | "EVIDENCE"
  | "PAYMENT_REGISTER"
  | "BANK_FILE"
  | "CASH_SHEET"
  | "PAYSLIP_PDF"
  | "MANIFEST"
  | "EXCEPTION_REPORT"
  | "TIMESTAMP_TOKEN";

/** Manual HTTP attach only — generated types stay server-side. */
export type AttachedArtifactType = "EVIDENCE" | "EXCEPTION_REPORT";

/** JSON list row for HTTP — dates as ISO strings (not Drizzle `Date`). */
export interface ArtifactListItem {
  readonly id: string;
  readonly runId: string | null;
  readonly entityType: ArtifactRow["entityType"];
  readonly entityId: string | null;
  readonly type: ArtifactRow["type"];
  readonly relativePath: string;
  readonly sha256: string;
  readonly byteSize: number;
  readonly mimeType: string;
  readonly source: ArtifactRow["source"];
  readonly createdBy: string;
  readonly createdAt: string;
}

function toArtifactListItem(row: ArtifactRow): ArtifactListItem {
  return {
    id: row.id,
    runId: row.runId,
    entityType: row.entityType,
    entityId: row.entityId,
    type: row.type,
    relativePath: row.relativePath,
    sha256: row.sha256,
    byteSize: row.byteSize,
    mimeType: row.mimeType,
    source: row.source,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface StoreArtifactInput {
  readonly runId: string;
  readonly type: ArtifactType;
  readonly filename: string;
  readonly body: Uint8Array;
  readonly mimeType: string;
  readonly createdBy: string;
  readonly source?: "ATTACHED" | "GENERATED";
  readonly entityId?: string | null;
}

export interface StoreAttachedRunArtifactInput {
  readonly runId: string;
  readonly type: AttachedArtifactType;
  readonly filename: string;
  readonly body: Uint8Array;
  readonly mimeType: string;
  readonly createdBy: string;
  readonly entityId?: string | null;
}

let defaultStore: ArtifactStore | null = null;

export function setArtifactStore(store: ArtifactStore): void {
  defaultStore = store;
}

export function getArtifactStore(): ArtifactStore {
  if (defaultStore === null) {
    // Local FS until R2 is configured / tests inject MemoryArtifactStore.
    defaultStore = new LocalFsArtifactStore();
  }
  return defaultStore;
}

export function artifactObjectKey(
  runId: string,
  artifactId: string,
  filename: string
): string {
  const safeName = sanitizeArtifactFilename(filename);
  return `runs/${runId}/${artifactId}/${safeName}`;
}

function assertArtifactBodySize(body: Uint8Array): void {
  if (body.byteLength > ARTIFACT_MAX_BODY_BYTES) {
    throw new ControlError(
      "VALIDATION_ERROR",
      `artifact exceeds ${ARTIFACT_MAX_BODY_BYTES} bytes`,
      413
    );
  }
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

async function putThenInsert(
  db: DbOrTx,
  store: ArtifactStore,
  relativePath: string,
  body: Uint8Array,
  mimeType: string,
  row: Parameters<typeof insertArtifactRow>[1]
): Promise<void> {
  assertArtifactBodySize(body);
  await store.put({
    key: relativePath,
    body,
    contentType: mimeType,
  });
  try {
    await insertArtifactRow(db, row);
  } catch (error) {
    try {
      await store.delete(relativePath);
    } catch (cleanupError) {
      throw new ControlError(
        "CONFLICT",
        `artifact metadata insert failed and byte cleanup failed: ${relativePath}`,
        undefined,
        {
          cause: new AggregateError(
            [asError(error), asError(cleanupError)],
            "insert and cleanup both failed"
          ),
        }
      );
    }
    throw error;
  }
}

export async function storeArtifact(
  db: DbOrTx,
  input: StoreArtifactInput,
  store: ArtifactStore = getArtifactStore()
): Promise<{ id: string; sha256: string; relativePath: string }> {
  const id = randomUUID();
  const sha256 = createHash("sha256").update(input.body).digest("hex");
  const relativePath = artifactObjectKey(input.runId, id, input.filename);

  await putThenInsert(db, store, relativePath, input.body, input.mimeType, {
    id,
    runId: input.runId,
    entityType: "PAY_RUN",
    entityId: input.entityId ?? input.runId,
    type: input.type,
    relativePath,
    sha256,
    byteSize: input.body.byteLength,
    mimeType: input.mimeType,
    source: input.source ?? "GENERATED",
    createdBy: input.createdBy,
  });

  return { id, sha256, relativePath };
}

export async function listRunArtifacts(
  db: Database,
  runId: string
): Promise<ArtifactListItem[]> {
  const rows = await listArtifactRowsByRunId(db, runId);
  return rows.map(toArtifactListItem);
}

/** Load an artifact that belongs to `runId`, or NOT_FOUND (no cross-run leak). */
export async function requireRunArtifact(
  db: Database,
  runId: string,
  artifactId: string
): Promise<ArtifactRow> {
  const row = await getArtifactRowById(db, artifactId);
  if (row === null || row.runId !== runId) {
    throw new ControlError("NOT_FOUND", `no such artifact: ${artifactId}`);
  }
  return row;
}

/** Bytes for authenticated SPA download (works for local FS and R2). */
export async function readRunArtifactContent(
  db: Database,
  runId: string,
  artifactId: string,
  store: ArtifactStore = getArtifactStore()
): Promise<{
  readonly body: Uint8Array;
  readonly mimeType: string;
  readonly filename: string;
}> {
  const row = await requireRunArtifact(db, runId, artifactId);
  const body = await store.get(row.relativePath);
  if (body === null) {
    throw new ControlError(
      "NOT_FOUND",
      `artifact bytes missing: ${artifactId}`
    );
  }
  const digest = createHash("sha256").update(body).digest("hex");
  if (digest !== row.sha256) {
    throw new ControlError("CONFLICT", `artifact hash mismatch: ${artifactId}`);
  }
  return {
    body,
    mimeType: row.mimeType,
    filename: filenameFromArtifactKey(row.relativePath),
  };
}

export type ArtifactEntityType =
  | "TRANSFER"
  | "EMPLOYMENT_PRIOR_YTD"
  | "PAY_RUN"
  | "OTHER";

export interface StoreAttachedEvidenceInput {
  readonly entityType: ArtifactEntityType;
  readonly entityId?: string | null;
  readonly runId?: string | null;
  readonly content: Buffer | Uint8Array | string;
  readonly filename: string;
  readonly mimeType: string;
  readonly actor: string;
}

function toBytes(content: Buffer | Uint8Array | string): Uint8Array {
  if (typeof content === "string") {
    return new TextEncoder().encode(content);
  }
  if (content instanceof Uint8Array) {
    return content;
  }
  return new Uint8Array(content);
}

/**
 * Entity-scoped evidence (transfer letters, prior-YTD payslips). Uses the same
 * ArtifactStore as run artifacts; keys are under `entities/…` when runId is absent.
 */
export async function storeAttachedEvidence(
  db: DbOrTx,
  input: StoreAttachedEvidenceInput,
  store: ArtifactStore = getArtifactStore()
): Promise<{
  id: string;
  sha256: string;
  relativePath: string;
  byteSize: number;
}> {
  const id = randomUUID();
  const body = toBytes(input.content);
  const sha256 = createHash("sha256").update(body).digest("hex");
  const safeName = sanitizeArtifactFilename(input.filename, "evidence.bin");
  const relativePath = input.runId
    ? artifactObjectKey(input.runId, id, safeName)
    : `entities/${input.entityType}/${id}/${safeName}`;

  await putThenInsert(db, store, relativePath, body, input.mimeType, {
    id,
    runId: input.runId ?? null,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    type: "EVIDENCE",
    relativePath,
    sha256,
    byteSize: body.byteLength,
    mimeType: input.mimeType,
    source: "ATTACHED",
    createdBy: input.actor,
  });

  return { id, sha256, relativePath, byteSize: body.byteLength };
}

/** Loads an artifact row or throws. */
export async function requireArtifact(
  db: DbOrTx,
  artifactId: string
): Promise<ArtifactRow> {
  const row = await getArtifactRowById(db, artifactId);
  if (row === null) {
    throw new ControlError("NOT_FOUND", `no such artifact: ${artifactId}`);
  }
  return row;
}

// --- Actor-gated entrypoints (HTTP / SPA) ---

export async function listRunArtifactsForActor(
  db: Database,
  actorUserId: string,
  runId: string
): Promise<ArtifactListItem[]> {
  await requirePayRunPermission(db, actorUserId, "READ", runId);
  return await listRunArtifacts(db, runId);
}

export async function storeArtifactForActor(
  db: Database,
  actorUserId: string,
  input: StoreAttachedRunArtifactInput,
  store: ArtifactStore = getArtifactStore()
): Promise<{ id: string; sha256: string; relativePath: string }> {
  await requirePayRunPermission(db, actorUserId, "UPDATE", input.runId);
  return await storeArtifact(
    db,
    {
      ...input,
      source: "ATTACHED",
    },
    store
  );
}

export async function readRunArtifactContentForActor(
  db: Database,
  actorUserId: string,
  runId: string,
  artifactId: string,
  store: ArtifactStore = getArtifactStore()
): Promise<{
  readonly body: Uint8Array;
  readonly mimeType: string;
  readonly filename: string;
}> {
  await requirePayRunPermission(db, actorUserId, "READ", runId);
  return await readRunArtifactContent(db, runId, artifactId, store);
}
