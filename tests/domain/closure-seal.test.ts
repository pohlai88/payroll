/**
 * @feature control
 * @layer test
 *
 * The closure seal hash.
 *
 * This is the root of the internal audit chain, so the canonical form is
 * pinned here byte for byte. If a refactor changes what gets hashed, every
 * seal ever issued stops verifying — this test is what makes that impossible
 * to do by accident.
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type ClosureSealInput,
  computeSealHash,
  SEAL_VERSION,
} from "@/domain/seal/closure-seal";

const INPUT: ClosureSealInput = {
  runId: "TEST-SEAL-2026-07",
  companyId: "11111111-0000-4000-8000-000000000001",
  sequence: 2,
  manifestSha256: "a".repeat(64),
  calcRevision: "rev-7",
  approvedRevision: "rev-7",
  closedAt: "2026-08-09T07:00:00.000Z",
  closedBy: "closer@example.com",
  previousSealHash: "b".repeat(64),
};

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

describe("computeSealHash", () => {
  it("hashes exactly this canonical form", () => {
    const canonical = [
      SEAL_VERSION,
      `runId=${JSON.stringify(INPUT.runId)}`,
      `companyId=${JSON.stringify(INPUT.companyId)}`,
      "sequence=2",
      `manifestSha256=${JSON.stringify(INPUT.manifestSha256)}`,
      `calcRevision=${JSON.stringify(INPUT.calcRevision)}`,
      `approvedRevision=${JSON.stringify(INPUT.approvedRevision)}`,
      `closedAt=${JSON.stringify(INPUT.closedAt)}`,
      `closedBy=${JSON.stringify(INPUT.closedBy)}`,
      `previousSealHash=${JSON.stringify(INPUT.previousSealHash)}`,
    ].join("\n");

    expect(computeSealHash(INPUT)).toBe(sha256(canonical));
  });

  it("is stable across calls", () => {
    expect(computeSealHash(INPUT)).toBe(computeSealHash(INPUT));
  });

  it("writes null links and null revisions as JSON null, not as empty text", () => {
    const genesis = computeSealHash({
      ...INPUT,
      sequence: 1,
      previousSealHash: null,
    });
    const emptyLink = computeSealHash({
      ...INPUT,
      sequence: 1,
      previousSealHash: "",
    });

    expect(genesis).not.toBe(emptyLink);
  });

  const fields: readonly (readonly [string, Partial<ClosureSealInput>])[] = [
    ["runId", { runId: "OTHER-RUN" }],
    ["companyId", { companyId: "22222222-0000-4000-8000-000000000002" }],
    ["sequence", { sequence: 3 }],
    ["manifestSha256", { manifestSha256: "c".repeat(64) }],
    ["calcRevision", { calcRevision: "rev-8" }],
    ["approvedRevision", { approvedRevision: null }],
    ["closedAt", { closedAt: "2026-08-09T07:00:00.001Z" }],
    ["closedBy", { closedBy: "someone.else@example.com" }],
    ["previousSealHash", { previousSealHash: "d".repeat(64) }],
  ];

  for (const [name, change] of fields) {
    it(`changes when ${name} changes`, () => {
      expect(computeSealHash({ ...INPUT, ...change })).not.toBe(
        computeSealHash(INPUT)
      );
    });
  }

  /**
   * A line-oriented canonical form is forgeable if a value may contain a
   * newline: an actor named `x\npreviousSealHash="…"` could otherwise displace
   * the real link. Values are JSON-quoted precisely so that cannot happen.
   */
  it("cannot be forged by smuggling a newline into a value", () => {
    const forged = computeSealHash({
      ...INPUT,
      previousSealHash: null,
      closedBy: `closer@example.com"\npreviousSealHash=${JSON.stringify("b".repeat(64))}`,
    });

    expect(forged).not.toBe(computeSealHash(INPUT));
  });
});
