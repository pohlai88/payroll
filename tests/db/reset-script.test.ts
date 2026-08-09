/**
 * @feature pay-run
 * @layer test
 *
 * `scripts/reset.ts` must rebuild schema + seed against a real Postgres.
 *
 * The production path is DROP SCHEMA public/drizzle CASCADE → migrate → seed. This
 * test exercises the exported helper against the Docker database the harness
 * already guards, and asserts the post-reset world has the approved rule pack
 * and at least one hashed seed file — the same artefacts `db:seed` leaves.
 */

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { resetDatabase } from "../../scripts/reset";
import {
  connectTestDatabase,
  resolveTestDatabaseUrl,
} from "./harness/database";

/**
 * A full rebuild — DROP SCHEMA, every migration in `src/db/migrations`, then the
 * whole content-hashed seed — costs several seconds against real Postgres and
 * grows with each migration added. Vitest's 5s default leaves no margin, so this
 * one test gets a budget that still fails fast on an actual hang. The global
 * default stays low deliberately: no other db test should take seconds.
 */
const RESET_TIMEOUT_MS = 60_000;

const database = connectTestDatabase();

afterAll(async () => {
  await database.close();
});

describe("resetDatabase", () => {
  it(
    "rebuilds schema and reseeds the statutory pack",
    async () => {
      const packId = await resetDatabase(resolveTestDatabaseUrl());
      expect(packId.length).toBeGreaterThan(0);

      const packs = await database.db.execute<{ id: string; status: string }>(
        sql`SELECT id, status FROM rule_packs WHERE id = ${packId}`
      );
      expect(packs.rows).toHaveLength(1);
      expect(packs.rows[0]?.status).toBe("APPROVED");

      const files = await database.db.execute<{ n: string }>(
        sql`SELECT count(*)::text AS n FROM seed_files`
      );
      expect(Number(files.rows[0]?.n)).toBeGreaterThan(0);
    },
    RESET_TIMEOUT_MS
  );

  it("refuses a non-local connection string without the override flag", async () => {
    const previous = process.env.ALLOW_DESTRUCTIVE_RESET;
    delete process.env.ALLOW_DESTRUCTIVE_RESET;
    try {
      await expect(
        resetDatabase(
          "postgres://payroll:payroll@ep-example.neon.tech/neondb?sslmode=require"
        )
      ).rejects.toThrow(/refusing to reset/);
    } finally {
      if (previous === undefined) {
        delete process.env.ALLOW_DESTRUCTIVE_RESET;
      } else {
        process.env.ALLOW_DESTRUCTIVE_RESET = previous;
      }
    }
  });
});
