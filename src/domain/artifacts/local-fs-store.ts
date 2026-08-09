/**
 * Local filesystem ArtifactStore — used when R2 is not configured.
 * Bytes under `data/artifacts/<key>`; never trust caller paths.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ArtifactStore, PutObjectInput } from "./store";

export class LocalFsArtifactStore implements ArtifactStore {
  private readonly root: string;

  constructor(root = path.join(process.cwd(), "data", "artifacts")) {
    this.root = root;
  }

  async put(input: PutObjectInput): Promise<void> {
    const absolute = this.resolve(input.key);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, input.body);
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return await readFile(this.resolve(key));
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return null;
      }
      throw error;
    }
  }

  signedGetUrl(key: string, _expiresInSeconds = 300): Promise<string> {
    const absolute = this.resolve(key);
    // file:// is enough for local ops; UI will use R2 signed URLs in prod.
    return Promise.resolve(`file://${absolute.replace(/\\/g, "/")}`);
  }

  private resolve(key: string): string {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("..") ||
      path.isAbsolute(normalized) ||
      normalized.startsWith("/")
    ) {
      throw new Error(`refusing unsafe artifact key: ${key}`);
    }
    return path.join(this.root, ...normalized.split("/"));
  }
}
