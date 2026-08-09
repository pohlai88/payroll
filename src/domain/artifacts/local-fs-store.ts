/**
 * Local filesystem ArtifactStore — used when R2 is not configured.
 * Bytes under `data/artifacts/<key>`; never trust caller paths.
 */

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertSafeArtifactKey } from "./keys";
import type { ArtifactStore, PutObjectInput } from "./store";

function isNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export class LocalFsArtifactStore implements ArtifactStore {
  private readonly root: string;

  constructor(root = path.join(process.cwd(), "data", "artifacts")) {
    this.root = path.resolve(root);
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
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolve(key));
    } catch (error) {
      if (isNotFound(error)) {
        return;
      }
      throw error;
    }
  }

  private resolve(key: string): string {
    const normalized = assertSafeArtifactKey(key);
    const absolute = path.resolve(this.root, ...normalized.split("/"));
    const relative = path.relative(this.root, absolute);
    if (
      relative.length === 0 ||
      relative.startsWith(`..${path.sep}`) ||
      relative === ".." ||
      path.isAbsolute(relative)
    ) {
      throw new Error(`refusing unsafe artifact key: ${key}`);
    }
    return absolute;
  }
}
