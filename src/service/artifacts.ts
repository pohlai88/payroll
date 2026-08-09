/**
 * Store hashed artifacts in R2 (or injectable store) and persist metadata.
 */

import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { artifacts } from "@/db/schema/artifacts";
import { LocalFsArtifactStore } from "@/domain/artifacts/local-fs-store";
import type { ArtifactStore } from "@/domain/artifacts/store";
import { ControlError } from "./control-errors";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbOrTx = Database | Transaction;

export type ArtifactType =
  | "EVIDENCE"
  | "PAYMENT_REGISTER"
  | "BANK_FILE"
  | "CASH_SHEET"
  | "PAYSLIP_PDF"
  | "MANIFEST"
  | "EXCEPTION_REPORT";

export interface StoreArtifactInput {
  readonly runId: string;
  readonly type: ArtifactType;
  readonly filename: string;
  readonly body: Uint8Array;
  readonly mimeType: string;
  readonly createdBy: string;
  readonly source?: "ATTACHED" | "GENERATED";
  readonly entityId?: string | null;
  readonly lineId?: string | null;
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
  return `runs/${runId}/${artifactId}/${filename}`;
}

export async function storeArtifact(
  db: DbOrTx,
  input: StoreArtifactInput,
  store: ArtifactStore = getArtifactStore()
): Promise<{ id: string; sha256: string; relativePath: string }> {
  const id = randomUUID();
  const sha256 = createHash("sha256").update(input.body).digest("hex");
  const relativePath = artifactObjectKey(input.runId, id, input.filename);

  await store.put({
    key: relativePath,
    body: input.body,
    contentType: input.mimeType,
  });

  await db.insert(artifacts).values({
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

export async function listRunArtifacts(db: Database, runId: string) {
  return await db.select().from(artifacts).where(eq(artifacts.runId, runId));
}

export async function signedArtifactUrl(
  db: Database,
  artifactId: string,
  store: ArtifactStore = getArtifactStore()
): Promise<{ url: string; filename: string }> {
  const [row] = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, artifactId))
    .limit(1);
  if (row === undefined) {
    throw new ControlError("NOT_FOUND", `no such artifact: ${artifactId}`);
  }
  const url = await store.signedGetUrl(row.relativePath);
  return {
    url,
    filename: row.relativePath.split("/").pop() ?? row.relativePath,
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
  const safeName = input.filename
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 180);
  const relativePath = input.runId
    ? artifactObjectKey(input.runId, id, safeName || "evidence.bin")
    : `entities/${input.entityType}/${id}/${safeName || "evidence.bin"}`;

  await store.put({
    key: relativePath,
    body,
    contentType: input.mimeType,
  });

  await db.insert(artifacts).values({
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
): Promise<typeof artifacts.$inferSelect> {
  const [row] = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, artifactId))
    .limit(1);
  if (row === undefined) {
    throw new ControlError("NOT_FOUND", `no such artifact: ${artifactId}`);
  }
  return row;
}
