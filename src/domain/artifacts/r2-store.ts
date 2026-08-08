/**
 * Cloudflare R2 via S3-compatible API.
 */

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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
  const bucket = config.bucket;

  return {
    async put(input: PutObjectInput): Promise<void> {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
        })
      );
    },

    async get(key: string): Promise<Uint8Array | null> {
      try {
        const out = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key })
        );
        if (out.Body === undefined) {
          return null;
        }
        const bytes = await out.Body.transformToByteArray();
        return bytes;
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

    async signedGetUrl(key: string, expiresInSeconds = 300): Promise<string> {
      return await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: expiresInSeconds }
      );
    },
  };
}
