/**
 * Cloudflare R2 via S3-compatible API.
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

export function createR2Store(config: R2Config): ArtifactStore {
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
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
        const name =
          error instanceof Error && "name" in error
            ? (error as { name: string }).name
            : "";
        if (name === "NoSuchKey" || name === "NotFound") {
          return null;
        }
        throw error;
      }
    },

    async delete(key: string): Promise<void> {
      const safe = assertSafeArtifactKey(key);
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: safe })
      );
    },
  };
}
