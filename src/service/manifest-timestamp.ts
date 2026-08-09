/**
 * @feature control
 * @layer service
 * @hub src/server/routes/pay-run-control.ts
 *
 * RFC 3161 timestamping of a closed run's manifest.
 *
 * The manifest already carries the sha256 of every artifact in the run, so one
 * token over the manifest's own hash covers all of them. The token says only
 * that these bytes existed at the authority's clock reading — it is evidence
 * about the run, never an input to it, which is why obtaining one may fail
 * without failing the closure, and why it can be obtained later instead.
 *
 * Legal weight is a separate question from cryptographic soundness: under the
 * Digital Signature Act 1997 only a date/time stamp service recognised by the
 * MCMC carries the statutory presumption. Swapping `TSA_URL` for such a
 * service is the whole of that change.
 */

import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { artifacts } from "@/db/schema/artifacts";
import { auditEvents, payRuns } from "@/db/schema/run";
import type { ArtifactStore } from "@/domain/artifacts/store";
import {
  requestTimestamp,
  type TimestampResult,
} from "@/domain/timestamp/client";
import { storeArtifact } from "./artifacts";

const TOKEN_FILENAME = "manifest.json.tsr";
const TOKEN_MIME_TYPE = "application/timestamp-reply";
/** Closure waits on this; a slow authority must not hold a payroll open. */
const CLOSE_PATH_TIMEOUT_MS = 5000;

export type TimestampRequester = (input: {
  readonly url: string;
  readonly hashHex: string;
}) => Promise<TimestampResult>;

export interface TimestampManifestOptions {
  /** `undefined` reads TSA_URL from the environment; `null` disables. */
  readonly tsaUrl?: string | null;
  readonly request?: TimestampRequester;
  readonly store?: ArtifactStore;
}

export interface TimestampOutcome {
  readonly state: "STAMPED" | "ALREADY_STAMPED" | "SKIPPED" | "FAILED";
  readonly detail: string;
  readonly tokenArtifactId: string | null;
  /** ISO 8601, as the authority stated it — not our own clock. */
  readonly genTime: string | null;
}

/**
 * Offered to a client who wants a third party to corroborate our seals. It is
 * free and audited, but it is not on the MCMC's list, so it adds corroboration
 * rather than the s.62 presumption — see `.env.example`.
 */
const SUGGESTED_TSA_URL = "http://timestamp.digicert.com";

/** Absent or blank means "do not timestamp", which is the dev/test default. */
export function configuredTsaUrl(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const raw = env.TSA_URL?.trim();
  return raw === undefined || raw === "" ? null : raw;
}

export interface TimestampStatus {
  /** Whether this deployment has been pointed at an authority at all. */
  readonly configured: boolean;
  readonly tsaUrl: string | null;
  readonly suggestedTsaUrl: string;
  readonly tokenArtifactId: string | null;
  /** ISO 8601, as the authority stated it. Null until a token exists. */
  readonly genTime: string | null;
}

/**
 * What the closure panel needs to say about third-party stamping: whether it
 * is on, and whether this run actually has a token.
 */
export async function closureTimestampStatus(
  db: Database,
  runId: string
): Promise<TimestampStatus> {
  const tsaUrl = configuredTsaUrl();

  const [token] = await db
    .select({ id: artifacts.id })
    .from(artifacts)
    .where(
      and(eq(artifacts.runId, runId), eq(artifacts.type, "TIMESTAMP_TOKEN"))
    )
    .limit(1);

  let genTime: string | null = null;
  if (token !== undefined) {
    const [event] = await db
      .select({ after: auditEvents.after })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityId, token.id),
          eq(auditEvents.action, "TIMESTAMP_MANIFEST")
        )
      )
      .limit(1);
    const recorded = (event?.after as { genTime?: unknown } | null)?.genTime;
    genTime = typeof recorded === "string" ? recorded : null;
  }

  return {
    configured: tsaUrl !== null,
    tsaUrl,
    suggestedTsaUrl: SUGGESTED_TSA_URL,
    tokenArtifactId: token?.id ?? null,
    genTime,
  };
}

function outcome(
  state: TimestampOutcome["state"],
  detail: string,
  tokenArtifactId: string | null = null,
  genTime: string | null = null
): TimestampOutcome {
  return { state, detail, tokenArtifactId, genTime };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const defaultRequester: TimestampRequester = (input) =>
  requestTimestamp({ ...input, timeoutMs: CLOSE_PATH_TIMEOUT_MS });

/**
 * Idempotent: a run that already has a token keeps it. Never throws for
 * anything the authority does — callers treat a missing token as "retry
 * later", not as a failed closure.
 */
export async function timestampClosureManifest(
  db: Database,
  runId: string,
  actor: string,
  options: TimestampManifestOptions = {}
): Promise<TimestampOutcome> {
  const url =
    options.tsaUrl === undefined ? configuredTsaUrl() : options.tsaUrl;
  if (url === null) {
    return outcome("SKIPPED", "no TSA_URL configured");
  }

  const [run] = await db
    .select({ manifestArtifactId: payRuns.closedManifestArtifactId })
    .from(payRuns)
    .where(eq(payRuns.id, runId))
    .limit(1);
  if (run === undefined) {
    return outcome("SKIPPED", `no such run: ${runId}`);
  }
  if (run.manifestArtifactId === null) {
    return outcome("SKIPPED", `run ${runId} has no closure manifest`);
  }

  const [existing] = await db
    .select({ id: artifacts.id })
    .from(artifacts)
    .where(
      and(eq(artifacts.runId, runId), eq(artifacts.type, "TIMESTAMP_TOKEN"))
    )
    .limit(1);
  if (existing !== undefined) {
    return outcome(
      "ALREADY_STAMPED",
      `run ${runId} already has a timestamp token`,
      existing.id
    );
  }

  const [manifest] = await db
    .select({ sha256: artifacts.sha256 })
    .from(artifacts)
    .where(eq(artifacts.id, run.manifestArtifactId))
    .limit(1);
  if (manifest === undefined) {
    return outcome(
      "SKIPPED",
      `manifest artifact ${run.manifestArtifactId} is missing`
    );
  }

  let result: TimestampResult;
  try {
    result = await (options.request ?? defaultRequester)({
      url,
      hashHex: manifest.sha256,
    });
  } catch (error) {
    return outcome("FAILED", describe(error));
  }

  const genTime = result.genTime.toISOString();
  const tokenArtifactId = await db.transaction(async (tx) => {
    const stored = await storeArtifact(
      tx,
      {
        runId,
        type: "TIMESTAMP_TOKEN",
        filename: TOKEN_FILENAME,
        body: result.reply,
        mimeType: TOKEN_MIME_TYPE,
        createdBy: actor,
        source: "GENERATED",
      },
      options.store
    );

    await tx.insert(auditEvents).values({
      actor,
      runId,
      entity: "artifacts",
      entityId: stored.id,
      action: "TIMESTAMP_MANIFEST",
      after: {
        manifestArtifactId: run.manifestArtifactId,
        tokenArtifactId: stored.id,
        stampedSha256: manifest.sha256,
        tsaUrl: result.tsaUrl,
        genTime,
        serialNumber: result.serialNumber,
        policyOid: result.policyOid,
      },
    });

    return stored.id;
  });

  return outcome(
    "STAMPED",
    `stamped by ${result.tsaUrl} at ${genTime}`,
    tokenArtifactId,
    genTime
  );
}
