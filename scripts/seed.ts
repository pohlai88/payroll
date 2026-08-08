/**
 * Loads the verified rule pack and pay item catalog from `db/seed/`.
 *
 * Every file is hashed as it is read and the hash stored in `seed_files`, so an
 * edited band table is detectable rather than merely regrettable. The seed is
 * idempotent: running it twice leaves the same rows.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import type { Database } from "../src/db/client";
import {
  createDatabase,
  createPool,
  requireDatabaseUrl,
} from "../src/db/client";
import { payItems } from "../src/db/schema/catalog";
import {
  eisBands,
  epfBands,
  rulePacks,
  ruleSettings,
  ruleSources,
  seedFiles,
  socsoBands,
} from "../src/db/schema/rule-pack";
import type { Band5, PayItemDef, SocsoBand } from "../src/domain/calc/types";

const SEED_DIR = path.join(process.cwd(), "db", "seed");

interface SeedFile<T> {
  readonly name: string;
  readonly data: T;
  readonly sha256: string;
  readonly byteSize: number;
}

function read<T>(name: string): SeedFile<T> {
  const raw = fs.readFileSync(path.join(SEED_DIR, name));
  return {
    name,
    data: JSON.parse(raw.toString("utf8")) as T,
    sha256: createHash("sha256").update(raw).digest("hex"),
    byteSize: raw.byteLength,
  };
}

interface RulePackMeta {
  rulePack: {
    id: string;
    name: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    notes: string | null;
  };
  sources: Array<{
    ref: string;
    issuer: string;
    title: string;
    url: string;
    retrievedAt: string;
    sha256: string;
  }>;
  settings: Record<string, string>;
}

interface PayItemSeed
  extends Omit<
    PayItemDef,
    "epfWages" | "socsoWages" | "eisWages" | "prorates"
  > {
  nameEn: string;
  nameBm: string;
  epfWages: number;
  socsoWages: number;
  eisWages: number;
  prorates: number;
  isSystem: number;
  sort: number;
}

/**
 * The settings document as persisted.
 *
 * `statutoryLimits` is absent by design. It may only be written once each figure
 * has been verified against the instrument that sets it, and the Zod schema
 * treats it as optional precisely so an unverified pack is honest rather than
 * confidently wrong.
 */
function buildSettings(raw: Record<string, string>): Record<string, unknown> {
  const number = (key: string): number => {
    const value = raw[key];
    if (value === undefined) {
      throw new Error(`rule pack is missing setting: ${key}`);
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`rule pack setting ${key} is not a number: ${value}`);
    }
    return parsed;
  };
  const text = (key: string): string => {
    const value = raw[key];
    if (value === undefined) {
      throw new Error(`rule pack is missing setting: ${key}`);
    }
    return value;
  };

  return {
    epfTableCeilingSen: number("epf.table_ceiling_sen"),
    epfAboveEePct: number("epf.above.ee_pct"),
    epfAboveErPctLeThreshold: number("epf.above.er_pct_le_threshold"),
    epfAboveErPctGtThreshold: number("epf.above.er_pct_gt_threshold"),
    epfErThresholdSen: number("epf.er_threshold_sen"),
    epfPartCAboveEePct: number("epf.partC.above.ee_pct"),
    epfPartCAboveErPct: number("epf.partC.above.er_pct"),
    epfPartEAboveEePct: number("epf.partE.above.ee_pct"),
    epfPartEAboveErPct: number("epf.partE.above.er_pct"),
    epfPartFEePct: number("epf.partF.ee_pct"),
    epfPartFErPct: number("epf.partF.er_pct"),
    socsoCeilingSen: number("socso.ceiling_sen"),
    skbbkPhaseFrom: text("skbbk.phase_from"),
    skbbkPhaseTo: text("skbbk.phase_to"),
    eisCeilingSen: number("eis.ceiling_sen"),
    eisMinAge: number("eis.min_age"),
    eisMaxAgeExclusive: number("eis.max_age_exclusive"),
    eisFirstTimeReviewAge: number("eis.first_time_review_age"),
    hrdfLevyPct: number("hrdf.levy_pct"),
  };
}

export async function seed(db: Database): Promise<string> {
  const meta = read<RulePackMeta>("rule-pack-meta.json");
  const partA = read<Band5[]>("epf-part-a.json");
  const partC = read<Band5[]>("epf-part-c.json");
  const partE = read<Band5[]>("epf-part-e.json");
  const socso = read<SocsoBand[]>("socso-skbbk.json");
  const eis = read<Band5[]>("eis.json");
  const items = read<PayItemSeed[]>("pay-item-matrix.json");
  const files = [meta, partA, partC, partE, socso, eis, items];

  const packId = meta.data.rulePack.id;

  /**
   * The pack's content hash: the hashes of the files that constitute it, in a
   * fixed order, hashed together. A run stamps this, so "reproduce that payroll"
   * resolves to specific bytes rather than to a name whose meaning may since
   * have changed.
   */
  const contentHash = createHash("sha256")
    .update(files.map((f) => `${f.name}:${f.sha256}`).join("\n"))
    .digest("hex");

  /**
   * An already-approved pack is frozen, content and all, so re-seeding is a
   * no-op — unless the files have changed, in which case this is not the same
   * pack any more and saying so is the whole point. A changed statutory table
   * requires a new version, not a quiet overwrite of one that has already
   * produced payslips.
   */
  const [existing] = await db
    .select({ status: rulePacks.status, contentHash: rulePacks.contentHash })
    .from(rulePacks)
    .where(eq(rulePacks.id, packId))
    .limit(1);

  if (
    existing !== undefined &&
    ["APPROVED", "EFFECTIVE", "SUPERSEDED"].includes(existing.status)
  ) {
    if (existing.contentHash !== contentHash) {
      throw new Error(
        `rule pack ${packId} is already approved with content hash ${existing.contentHash}, ` +
          `but db/seed now hashes to ${contentHash}. An approved pack is immutable: ` +
          "issue a new pack version and supersede this one."
      );
    }
    await recordSeedFiles(db, files);
    return packId;
  }

  await db.transaction(async (tx) => {
    /**
     * Created DRAFT, then promoted once its content is loaded — the same path
     * any pack takes. The database refuses content changes to an approved pack,
     * so even the seed cannot assemble one out of order.
     */
    await tx
      .insert(rulePacks)
      .values({
        id: packId,
        name: meta.data.rulePack.name,
        layer: "STATUTORY_CALCULATION",
        jurisdiction: "MY",
        authority: "KWSP/PERKESO",
        code: "MY-STATUTORY",
        version: packId,
        effectiveFrom: meta.data.rulePack.effectiveFrom,
        effectiveTo: meta.data.rulePack.effectiveTo,
        status: "DRAFT",
        notes: meta.data.rulePack.notes,
      })
      .onConflictDoNothing();

    for (const source of meta.data.sources) {
      await tx
        .insert(ruleSources)
        .values({ rulePackId: packId, ...source })
        .onConflictDoNothing();
    }

    await tx
      .insert(ruleSettings)
      .values({
        rulePackId: packId,
        settings: buildSettings(meta.data.settings),
      })
      .onConflictDoNothing();

    for (const [part, bands] of [
      ["A", partA],
      ["C", partC],
      ["E", partE],
    ] as const) {
      await tx
        .insert(epfBands)
        .values(bands.data.map((b) => ({ rulePackId: packId, part, ...b })))
        .onConflictDoNothing();
    }

    await tx
      .insert(socsoBands)
      .values(socso.data.map((b) => ({ rulePackId: packId, ...b })))
      .onConflictDoNothing();

    await tx
      .insert(eisBands)
      .values(eis.data.map((b) => ({ rulePackId: packId, ...b })))
      .onConflictDoNothing();

    await tx
      .insert(payItems)
      .values(
        items.data.map((i) => ({
          code: i.code,
          nameEn: i.nameEn,
          nameMs: i.nameBm,
          kind: i.kind,
          rateBasis: i.rateBasis,
          epfWages: i.epfWages === 1,
          socsoWages: i.socsoWages === 1,
          eisWages: i.eisWages === 1,
          prorates: i.prorates === 1,
          isSystem: i.isSystem === 1,
          sort: i.sort,
        }))
      )
      .onConflictDoNothing();

    /**
     * The content is loaded; someone now takes responsibility for it. These are
     * the carried band tables the golden master is pinned against, verified
     * before they ever reached this repository.
     */
    await tx
      .update(rulePacks)
      .set({
        status: "APPROVED",
        contentHash,
        approvedBy: "carried-verified-seed",
        approvedAt: new Date(),
      })
      .where(eq(rulePacks.id, packId));
  });

  await recordSeedFiles(db, files);
  return packId;
}

/** Outside the pack transaction: these hashes describe files, not pack content. */
async function recordSeedFiles(
  db: Database,
  files: readonly SeedFile<unknown>[]
): Promise<void> {
  for (const file of files) {
    await db
      .insert(seedFiles)
      .values({
        fileName: file.name,
        sha256: file.sha256,
        byteSize: file.byteSize,
      })
      .onConflictDoUpdate({
        target: seedFiles.fileName,
        set: {
          sha256: file.sha256,
          byteSize: file.byteSize,
          loadedAt: sql`now()`,
        },
      });
  }
}

async function main(): Promise<void> {
  const pool = createPool(requireDatabaseUrl());
  try {
    const packId = await seed(createDatabase(pool));
    process.stdout.write(`seeded rule pack ${packId}\n`);
  } finally {
    await pool.end();
  }
}

// Only run when invoked directly, so tests can import `seed`.
if (process.argv[1]?.endsWith("seed.ts")) {
  await main();
}
