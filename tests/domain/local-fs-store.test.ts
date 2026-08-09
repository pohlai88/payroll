/**
 * LocalFs + key normalisation — path safety and put/get/delete round-trip.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertSafeArtifactKey,
  filenameFromArtifactKey,
  sanitizeArtifactFilename,
} from "@/domain/artifacts/keys";
import { LocalFsArtifactStore } from "@/domain/artifacts/local-fs-store";
import { MemoryArtifactStore } from "@/domain/artifacts/store";

describe("assertSafeArtifactKey", () => {
  it("normalises backslashes and accepts nested keys", () => {
    expect(assertSafeArtifactKey("runs\\a\\b\\file.txt")).toBe(
      "runs/a/b/file.txt"
    );
  });

  it("rejects traversal, absolute, empty, and null segments", () => {
    expect(() => assertSafeArtifactKey("")).toThrow(/empty/);
    expect(() => assertSafeArtifactKey("../etc/passwd")).toThrow(/unsafe/);
    expect(() => assertSafeArtifactKey("runs/../x")).toThrow(/unsafe/);
    expect(() => assertSafeArtifactKey("/abs")).toThrow(/unsafe/);
    expect(() => assertSafeArtifactKey("runs//x")).toThrow(/unsafe/);
    expect(() => assertSafeArtifactKey("runs/./x")).toThrow(/unsafe/);
    expect(() => assertSafeArtifactKey("C:/windows")).toThrow(/unsafe/);
  });
});

describe("sanitizeArtifactFilename", () => {
  it("collapses path-like and odd characters to one segment", () => {
    expect(sanitizeArtifactFilename("../../evil.pdf")).toBe(".._.._evil.pdf");
    expect(sanitizeArtifactFilename("a/b\\c.txt")).toBe("a_b_c.txt");
    expect(sanitizeArtifactFilename("!!!")).toBe("artifact.bin");
  });
});

describe("filenameFromArtifactKey", () => {
  it("returns the last segment", () => {
    expect(filenameFromArtifactKey("runs/r/id/note.txt")).toBe("note.txt");
  });
});

describe("LocalFsArtifactStore", () => {
  let root = "";

  afterEach(async () => {
    if (root.length > 0) {
      await rm(root, { recursive: true, force: true });
      root = "";
    }
  });

  it("round-trips bytes and deletes under the root", async () => {
    root = await mkdtemp(path.join(tmpdir(), "payroll-artifacts-"));
    const store = new LocalFsArtifactStore(root);
    const key = "runs/r1/a1/note.txt";
    const body = new TextEncoder().encode("hello-local");

    await store.put({ key, body, contentType: "text/plain" });
    const got = await store.get(key);
    expect(got).not.toBeNull();
    expect(new TextDecoder().decode(got as Uint8Array)).toBe("hello-local");
    expect(await store.get("runs/r1/a1/missing.txt")).toBeNull();

    await expect(
      store.put({
        key: "../outside.txt",
        body,
        contentType: "text/plain",
      })
    ).rejects.toThrow(/unsafe/);

    await store.delete(key);
    expect(await store.get(key)).toBeNull();
    await store.delete(key);
  });
});

describe("MemoryArtifactStore key safety", () => {
  it("rejects unsafe keys the same way as LocalFs", async () => {
    const store = new MemoryArtifactStore();
    await expect(
      store.put({
        key: "runs/../x",
        body: new Uint8Array([1]),
        contentType: "application/octet-stream",
      })
    ).rejects.toThrow(/unsafe/);
  });
});
