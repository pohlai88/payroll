/**
 * Artifact byte store — R2 in production, LocalFs when unset, Memory in tests.
 *
 * DB rows own metadata + sha256; this interface owns only the bytes.
 * SPA downloads via authenticated GET …/content (not signed URLs).
 */

import { assertSafeArtifactKey } from "./keys";

export interface PutObjectInput {
  readonly key: string;
  readonly body: Uint8Array;
  readonly contentType: string;
}

export interface ArtifactStore {
  put: (input: PutObjectInput) => Promise<void>;
  get: (key: string) => Promise<Uint8Array | null>;
  /** Best-effort cleanup when metadata insert fails after put. */
  delete: (key: string) => Promise<void>;
}

/** In-memory store for tests — never hits the network. */
export class MemoryArtifactStore implements ArtifactStore {
  private readonly objects = new Map<string, Uint8Array>();

  put(input: PutObjectInput): Promise<void> {
    try {
      const key = assertSafeArtifactKey(input.key);
      this.objects.set(key, input.body);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  get(key: string): Promise<Uint8Array | null> {
    try {
      const safe = assertSafeArtifactKey(key);
      return Promise.resolve(this.objects.get(safe) ?? null);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  delete(key: string): Promise<void> {
    try {
      this.objects.delete(assertSafeArtifactKey(key));
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  clear(): void {
    this.objects.clear();
  }
}
