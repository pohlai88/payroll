/**
 * @feature artifacts
 * @layer domain
 *
 * Cloudflare R2 via S3-compatible API.
 *
 * AWS SDK ≥3.729 defaults checksums to WHEN_SUPPORTED, which R2 rejects.
 * Force WHEN_REQUIRED per Cloudflare docs.
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { assertSafeArtifactKey } from "./keys";
import type { ArtifactStore, PutObjectInput } from "./store";

export interface R2Config {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
  readonly endpoint: string;
}

function isMissingObjectError(error: unknown): boolean {
  if (error === null || typeof error !== "object") {
    return false;
  }
  const name =
    "name" in error && typeof error.name === "string" ? error.name : "";
  if (name === "NoSuchKey" || name === "NotFound") {
    return true;
  }
  if ("Code" in error && error.Code === "NoSuchKey") {
    return true;
  }
  const meta = "$metadata" in error ? error.$metadata : undefined;
  return (
    meta !== null &&
    typeof meta === "object" &&
    "httpStatusCode" in meta &&
    meta.httpStatusCode === 404
  );
}

export function createR2Store(config: R2Config): ArtifactStore {
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const { bucket } = config;

  return {
    async put(input: PutObjectInput): Promise<void> {
      const key = assertSafeArtifactKey(input.key);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: input.body,
          ContentType: input.contentType,
        })
      );
    },

    async get(key: string): Promise<Uint8Array | null> {
      const safe = assertSafeArtifactKey(key);
      try {
        const out = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: safe })
        );
        if (out.Body === undefined) {
          return null;
        }
        return await out.Body.transformToByteArray();
      } catch (error) {
        if (isMissingObjectError(error)) {
          return null;
        }
        throw error;
      }
    },

    async delete(key: string): Promise<void> {
      const safe = assertSafeArtifactKey(key);
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: safe }));
    },
  };
}
