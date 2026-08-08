/**
 * Artifact byte store — R2 in production, in-memory in tests.
 *
 * DB rows own metadata + sha256; this interface owns only the bytes.
 */

export interface PutObjectInput {
  readonly key: string;
  readonly body: Uint8Array;
  readonly contentType: string;
}

export interface ArtifactStore {
  put(input: PutObjectInput): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  /** Short-lived download URL for the future UI agent. */
  signedGetUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

/** In-memory store for tests — never hits the network. */
export class MemoryArtifactStore implements ArtifactStore {
  private readonly objects = new Map<string, Uint8Array>();

  async put(input: PutObjectInput): Promise<void> {
    this.objects.set(input.key, input.body);
  }

  async get(key: string): Promise<Uint8Array | null> {
    return this.objects.get(key) ?? null;
  }

  async signedGetUrl(key: string, _expiresInSeconds = 300): Promise<string> {
    if (!this.objects.has(key)) {
      throw new Error(`artifact missing: ${key}`);
    }
    return `memory://${key}`;
  }

  clear(): void {
    this.objects.clear();
  }
}
