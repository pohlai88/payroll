/**
 * The closure seal — this project's own attestation that a run was closed
 * over a particular set of bytes, chained to the previous closure in the same
 * company.
 *
 * There is no third party here. What the chain buys is *detectability*: to
 * change a closed run's manifest, actor or time without the chain noticing,
 * you must also reissue that run's seal and every seal closed after it in the
 * company. The seals are append-only in the database, so that rewrite is not
 * something the application can perform.
 *
 * The canonical form is line-oriented and each value is JSON-quoted, so no
 * value can smuggle in a newline and displace a later field.
 */

import { createHash } from "node:crypto";

/** Prefix of the canonical form. Bump only alongside a re-seal migration. */
export const SEAL_VERSION = "clarity-seal-v1";

export interface ClosureSealInput {
  readonly runId: string;
  readonly companyId: string;
  /** 1-based position in the company's closure chain. */
  readonly sequence: number;
  readonly manifestSha256: string;
  /** Null on a run closed before any recompute stamped a revision. */
  readonly calcRevision: string | null;
  readonly approvedRevision: string | null;
  /** ISO-8601 instant the run reached CLOSED. */
  readonly closedAt: string;
  readonly closedBy: string;
  /** Seal hash of the previous closure in this company; null at genesis. */
  readonly previousSealHash: string | null;
}

/**
 * The exact bytes hashed. Exported so a verifier — including a human with
 * `sha256sum` — can reproduce a seal from the columns it was built from.
 */
export function canonicalSealForm(input: ClosureSealInput): string {
  return [
    SEAL_VERSION,
    `runId=${JSON.stringify(input.runId)}`,
    `companyId=${JSON.stringify(input.companyId)}`,
    `sequence=${input.sequence}`,
    `manifestSha256=${JSON.stringify(input.manifestSha256)}`,
    `calcRevision=${JSON.stringify(input.calcRevision)}`,
    `approvedRevision=${JSON.stringify(input.approvedRevision)}`,
    `closedAt=${JSON.stringify(input.closedAt)}`,
    `closedBy=${JSON.stringify(input.closedBy)}`,
    `previousSealHash=${JSON.stringify(input.previousSealHash)}`,
  ].join("\n");
}

export function computeSealHash(input: ClosureSealInput): string {
  return createHash("sha256")
    .update(canonicalSealForm(input), "utf8")
    .digest("hex");
}
