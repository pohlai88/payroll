/**
 * Evidence artifacts: hashed store + transfer FK.
 */

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryArtifactStore } from "@/domain/artifacts/store";
import {
  readRunArtifactContent,
  setArtifactStore,
  storeArtifact,
  storeAttachedEvidence,
} from "@/service/artifacts";
import { ControlError } from "@/service/control-errors";
import { commitTransfer } from "@/service/transfer";
import {
  ALL_TABLES,
  connectTestDatabase,
  type TestDatabase,
} from "./harness/database";

const database: TestDatabase = connectTestDatabase();
const { db } = database;
const store = new MemoryArtifactStore();

const RULE_PACK = "RP-ART-TEST";
const COMPANY_A = "bbbbbbbb-0000-4000-8000-000000000001";
const COMPANY_B = "bbbbbbbb-0000-4000-8000-000000000002";
const PERSON = "bbbbbbbb-0000-4000-8000-000000000003";
const EMPLOYMENT_A = "bbbbbbbb-0000-4000-8000-000000000004";

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  setArtifactStore(store);
  store.clear();
  await database.truncate(...ALL_TABLES);
  await db.execute(sql`
    INSERT INTO rule_packs (id, name, effective_from, content_hash, status, approved_by, approved_at)
    VALUES (${RULE_PACK}, 'test pack', '2026-01-01', ${"a".repeat(64)},
            'APPROVED', 'test-fixture', now())`);
  await db.execute(sql`
    INSERT INTO companies (id, code, name) VALUES
    (${COMPANY_A}, 'ARA', 'Art Co A'),
    (${COMPANY_B}, 'ARB', 'Art Co B')`);
  await db.execute(sql`
    INSERT INTO persons (id, name, ic, dob, group_service_date)
    VALUES (${PERSON}, 'ART PERSON', '900101-10-9999', '1990-01-01', '2020-01-01')`);
  await db.execute(sql`
    INSERT INTO employments (id, person_id, company_id, employee_code, join_date, pay_basis, base_rate_sen)
    VALUES (${EMPLOYMENT_A}, ${PERSON}, ${COMPANY_A}, 'A100', '2020-01-01', 'MONTHLY', 500000)`);
});

describe("storeAttachedEvidence", () => {
  it("rejects wrong entityType on commitTransfer", async () => {
    const stored = await storeAttachedEvidence(db, {
      entityType: "PAY_RUN",
      content: Buffer.from("x"),
      filename: "bad.pdf",
      mimeType: "application/pdf",
      actor: "artifacts-test",
    });
    await expect(
      commitTransfer(db, {
        personId: PERSON,
        fromEmploymentId: EMPLOYMENT_A,
        effectiveDate: "2026-09-01",
        toCompanyId: COMPANY_B,
        toEmployeeCode: "B101",
        groupServiceContinuity: "CONTINUOUS",
        evidenceArtifactId: stored.id,
        actor: "artifacts-test",
      })
    ).rejects.toThrow(/cannot evidence a transfer/);
  });

  it("writes bytes, records sha256, and links from a transfer", async () => {
    const content = Buffer.from("transfer letter body", "utf8");
    const expectedHash = createHash("sha256").update(content).digest("hex");

    const stored = await storeAttachedEvidence(db, {
      entityType: "TRANSFER",
      content,
      filename: "letter.pdf",
      mimeType: "application/pdf",
      actor: "artifacts-test",
    });

    expect(stored.sha256).toBe(expectedHash);
    const bytes = await store.get(stored.relativePath);
    expect(bytes).not.toBeNull();
    expect(
      createHash("sha256")
        .update(bytes as Uint8Array)
        .digest("hex")
    ).toBe(expectedHash);

    const { transferId } = await commitTransfer(db, {
      personId: PERSON,
      fromEmploymentId: EMPLOYMENT_A,
      effectiveDate: "2026-09-01",
      toCompanyId: COMPANY_B,
      toEmployeeCode: "B100",
      groupServiceContinuity: "CONTINUOUS",
      evidenceArtifactId: stored.id,
      actor: "artifacts-test",
    });

    const row = await db.execute<{ evidence_artifact_id: string }>(
      sql`SELECT evidence_artifact_id FROM transfers WHERE id = ${transferId}`
    );
    expect(row.rows[0]?.evidence_artifact_id).toBe(stored.id);
  });
});

describe("run-scoped artifact access", () => {
  const RUN_A = "ART-SCOPE-A";
  const RUN_B = "ART-SCOPE-B";

  beforeEach(async () => {
    await db.execute(sql`
      INSERT INTO pay_runs (
        id, company_id, rule_pack_id, year, month,
        period_start, period_end, working_days, status, created_by)
      VALUES
        (${RUN_A}, ${COMPANY_A}, ${RULE_PACK}, 2026, 7,
         '2026-07-01', '2026-07-31', 22, 'DRAFT', 'artifacts-test'),
        (${RUN_B}, ${COMPANY_A}, ${RULE_PACK}, 2026, 8,
         '2026-08-01', '2026-08-31', 22, 'DRAFT', 'artifacts-test')`);
  });

  it("rejects content when runId does not own the artifact", async () => {
    const stored = await storeArtifact(db, {
      runId: RUN_A,
      type: "EVIDENCE",
      filename: "owned.txt",
      body: new TextEncoder().encode("owned"),
      mimeType: "text/plain",
      createdBy: "artifacts-test",
      source: "ATTACHED",
    });

    const contentErr = await readRunArtifactContent(
      db,
      RUN_B,
      stored.id,
      store
    ).then(
      () => null,
      (error: unknown) => error
    );
    expect(contentErr).toBeInstanceOf(ControlError);
    expect((contentErr as ControlError).code).toBe("NOT_FOUND");

    const ok = await readRunArtifactContent(db, RUN_A, stored.id, store);
    expect(new TextDecoder().decode(ok.body)).toBe("owned");
    expect(ok.filename).toBe("owned.txt");
  });

  it("sanitizes path-like filenames into a single key segment", async () => {
    const stored = await storeArtifact(db, {
      runId: RUN_A,
      type: "EVIDENCE",
      filename: "../../evil.pdf",
      body: new TextEncoder().encode("x"),
      mimeType: "application/pdf",
      createdBy: "artifacts-test",
      source: "ATTACHED",
    });
    expect(stored.relativePath).toMatch(
      /^runs\/ART-SCOPE-A\/[0-9a-f-]+\/\.\._\.\._evil\.pdf$/
    );
    const bytes = await store.get(stored.relativePath);
    expect(bytes).not.toBeNull();
  });

  it("rejects content when stored bytes do not match sha256", async () => {
    const stored = await storeArtifact(db, {
      runId: RUN_A,
      type: "EVIDENCE",
      filename: "tamper.txt",
      body: new TextEncoder().encode("original"),
      mimeType: "text/plain",
      createdBy: "artifacts-test",
      source: "ATTACHED",
    });
    await store.put({
      key: stored.relativePath,
      body: new TextEncoder().encode("tampered"),
      contentType: "text/plain",
    });

    const err = await readRunArtifactContent(db, RUN_A, stored.id, store).then(
      () => null,
      (error: unknown) => error
    );
    expect(err).toBeInstanceOf(ControlError);
    expect((err as ControlError).code).toBe("CONFLICT");
  });

  it("deletes bytes when metadata insert fails", async () => {
    const tracking = new (class extends MemoryArtifactStore {
      deleted: string[] = [];
      delete(key: string): Promise<void> {
        this.deleted.push(key);
        return super.delete(key);
      }
    })();

    await expect(
      storeArtifact(
        db,
        {
          runId: "NO-SUCH-RUN",
          type: "EVIDENCE",
          filename: "orphan.txt",
          body: new TextEncoder().encode("orphan"),
          mimeType: "text/plain",
          createdBy: "artifacts-test",
          source: "ATTACHED",
        },
        tracking
      )
    ).rejects.toThrow();

    expect(tracking.deleted).toHaveLength(1);
    const key = tracking.deleted[0];
    expect(key).toBeDefined();
    expect(await tracking.get(key as string)).toBeNull();
  });
});
