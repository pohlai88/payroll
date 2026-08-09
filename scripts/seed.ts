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
import { employeeCustomFieldDefs } from "../src/db/schema/employee-profile";
import { companies, employments, persons } from "../src/db/schema/parties";
import { roles } from "../src/db/schema/rbac";
import {
  eisBands,
  epfBands,
  rulePacks,
  ruleSettings,
  ruleSources,
  seedFiles,
  socsoBands,
} from "../src/db/schema/rule-pack";
import { payRuns } from "../src/db/schema/run";
import type { Band5, PayItemDef, SocsoBand } from "../src/domain/calc/types";
import { createRun } from "../src/service/payrun";

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

/**
 * `pay-item-matrix.json`'s boolean-as-0/1 columns have no runtime schema
 * validation, so a typo (e.g. `2`) would otherwise coerce to `false` via
 * `=== 1` rather than fail loudly.
 */
function readFlag(value: number, field: string, code: string): boolean {
  if (value !== 0 && value !== 1) {
    throw new Error(
      `pay item ${code}: expected ${field} to be 0 or 1, got ${value}`
    );
  }
  return value === 1;
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
    epfSocsoRetirementAge: number("epf_socso.retirement_age"),
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
    await seedSourceCapturePack(db, "employment-law-sources.json");
    await seedSourceCapturePack(db, "pcb-sources.json");
    await recordSeedFiles(db, [read("pcb-table1-2026.json")]);
    await seedRbac(db);
    await seedEmployeeCustomFields(db);
    await seedCompanies(db);
    await seedDemoEmployees(db, packId);
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
          epfWages: readFlag(i.epfWages, "epfWages", i.code),
          socsoWages: readFlag(i.socsoWages, "socsoWages", i.code),
          eisWages: readFlag(i.eisWages, "eisWages", i.code),
          prorates: readFlag(i.prorates, "prorates", i.code),
          isSystem: readFlag(i.isSystem, "isSystem", i.code),
          sort: i.sort,
        }))
      )
      .onConflictDoNothing();

    // S06 treatments + PCB class for any newly inserted catalog rows.
    await tx.execute(sql`
      INSERT INTO pay_item_treatments (pay_item_id, scheme, subject, source, effective_from, actor)
      SELECT p.id, s.scheme, s.subject, 'STATUTORY_DEFAULT', '2000-01-01', 'seed'
      FROM pay_items p
      CROSS JOIN LATERAL (VALUES
        ('EPF'::treatment_scheme, p.epf_wages),
        ('SOCSO'::treatment_scheme, p.socso_wages),
        ('EIS'::treatment_scheme, p.eis_wages),
        ('HRD'::treatment_scheme, p.epf_wages)
      ) AS s(scheme, subject)
      WHERE NOT EXISTS (
        SELECT 1 FROM pay_item_treatments t
        WHERE t.pay_item_id = p.id AND t.scheme = s.scheme AND t.effective_to IS NULL
      )`);
    await tx.execute(sql`
      INSERT INTO pay_item_pcb_classes (pay_item_id, class, source, effective_from, actor)
      SELECT p.id,
        CASE
          WHEN p.kind = 'DEDUCTION' THEN 'EXCLUDED'::pcb_remuneration_class
          WHEN p.code = 'BONUS' THEN 'ADDITIONAL'::pcb_remuneration_class
          ELSE 'NORMAL'::pcb_remuneration_class
        END,
        'STATUTORY_DEFAULT', '2000-01-01', 'seed'
      FROM pay_items p
      WHERE NOT EXISTS (
        SELECT 1 FROM pay_item_pcb_classes c
        WHERE c.pay_item_id = p.id AND c.effective_to IS NULL
      )`);

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
  await seedSourceCapturePack(db, "employment-law-sources.json");
  await seedSourceCapturePack(db, "pcb-sources.json");
  await recordSeedFiles(db, [read("pcb-table1-2026.json")]);
  await seedRbac(db);
  await seedEmployeeCustomFields(db);
  await seedCompanies(db);
  await seedDemoEmployees(db, packId);
  return packId;
}

interface RbacSeed {
  roles: Array<{
    code: string;
    name: string;
    description: string;
    scope: "GLOBAL" | "COMPANY";
    isSystem: boolean;
  }>;
}

/**
 * The single system role. Idempotent: re-seeding refreshes name/description
 * but never demotes `is_system` or invents matrix rows for it.
 */
async function seedRbac(db: Database): Promise<void> {
  const file = read<RbacSeed>("rbac.json");
  for (const role of file.data.roles) {
    await db
      .insert(roles)
      .values({
        code: role.code,
        name: role.name,
        description: role.description,
        scope: role.scope,
        isSystem: role.isSystem,
      })
      .onConflictDoUpdate({
        target: roles.code,
        set: {
          name: role.name,
          description: role.description,
          scope: role.scope,
          isSystem: role.isSystem,
        },
      });
  }
  await recordSeedFiles(db, [file]);
}

interface EmployeeCustomFieldSeed {
  fields: Array<{
    fieldKey: string;
    label: string;
    dataType: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN";
    required: boolean;
    sortOrder: number;
    active: boolean;
  }>;
}

interface CompaniesSeed {
  companies: Array<{
    code: string;
    name: string;
    epfNo: string | null;
    socsoNo: string | null;
    lhdnNo: string | null;
    hrdfEnabled: boolean;
    hrdfLevyPct: string;
  }>;
}

/**
 * Multicompany party rows used by scope selection and employee import.
 * Idempotent on `code` — re-seed refreshes display/statutory fields without
 * inventing a second company for the same payroll company code.
 */
async function seedCompanies(db: Database): Promise<void> {
  const file = read<CompaniesSeed>("companies.json");
  for (const company of file.data.companies) {
    await db
      .insert(companies)
      .values({
        code: company.code,
        name: company.name,
        epfNo: company.epfNo,
        socsoNo: company.socsoNo,
        lhdnNo: company.lhdnNo,
        hrdfEnabled: company.hrdfEnabled,
        hrdfLevyPct: company.hrdfLevyPct,
      })
      .onConflictDoUpdate({
        target: companies.code,
        set: {
          name: company.name,
          epfNo: company.epfNo,
          socsoNo: company.socsoNo,
          lhdnNo: company.lhdnNo,
          hrdfEnabled: company.hrdfEnabled,
          hrdfLevyPct: company.hrdfLevyPct,
        },
      });
  }
  await recordSeedFiles(db, [file]);
}

interface DemoEmployeesSeed {
  employees: Array<{
    companyCode: string;
    employeeCode: string;
    name: string;
    ic: string;
    joinDate: string;
    payBasis: "MONTHLY" | "DAILY" | "HOURLY";
    baseRateSen: number;
    bankName: string;
    bankAccountNo: string;
  }>;
  payRuns: Array<{
    id: string;
    companyCode: string;
    year: number;
    month: number;
    periodStart: string;
    periodEnd: string;
    workingDays: number;
  }>;
}

/**
 * Demo persons / employments / DRAFT pay runs (with lines via createRun) so
 * local SPA pages are not empty after seed. Idempotent on IC (person),
 * company+employeeCode, and pay-run id (skip if the run already exists).
 */
async function seedDemoEmployees(
  db: Database,
  rulePackId: string
): Promise<void> {
  const file = read<DemoEmployeesSeed>("demo-employees.json");
  const companyRows = await db
    .select({ id: companies.id, code: companies.code })
    .from(companies);
  const companyByCode = new Map(companyRows.map((row) => [row.code, row.id]));

  for (const employee of file.data.employees) {
    const companyId = companyByCode.get(employee.companyCode);
    if (companyId === undefined) {
      throw new Error(
        `demo employee ${employee.employeeCode}: unknown company ${employee.companyCode}`
      );
    }

    const [existingPerson] = await db
      .select({ id: persons.id })
      .from(persons)
      .where(eq(persons.ic, employee.ic))
      .limit(1);

    let personId = existingPerson?.id;
    if (personId === undefined) {
      const [inserted] = await db
        .insert(persons)
        .values({ name: employee.name, ic: employee.ic })
        .returning({ id: persons.id });
      personId = inserted?.id;
    } else {
      await db
        .update(persons)
        .set({ name: employee.name })
        .where(eq(persons.id, personId));
    }

    if (personId === undefined) {
      throw new Error(`failed to insert person for ${employee.employeeCode}`);
    }

    await db
      .insert(employments)
      .values({
        personId,
        companyId,
        employeeCode: employee.employeeCode,
        joinDate: employee.joinDate,
        payBasis: employee.payBasis,
        baseRateSen: employee.baseRateSen,
        bankName: employee.bankName,
        bankAccountNo: employee.bankAccountNo,
        bankAccountName: employee.name,
      })
      .onConflictDoUpdate({
        target: [employments.companyId, employments.employeeCode],
        set: {
          joinDate: employee.joinDate,
          payBasis: employee.payBasis,
          baseRateSen: employee.baseRateSen,
          bankName: employee.bankName,
          bankAccountNo: employee.bankAccountNo,
          bankAccountName: employee.name,
        },
      });
  }

  for (const run of file.data.payRuns) {
    const companyId = companyByCode.get(run.companyCode);
    if (companyId === undefined) {
      throw new Error(
        `demo pay run ${run.id}: unknown company ${run.companyCode}`
      );
    }
    const [existing] = await db
      .select({ id: payRuns.id })
      .from(payRuns)
      .where(eq(payRuns.id, run.id))
      .limit(1);
    if (existing !== undefined) {
      continue;
    }
    const created = await createRun(db, {
      runId: run.id,
      companyId,
      rulePackId,
      year: run.year,
      month: run.month,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      workingDays: run.workingDays,
      actor: "seed",
    });
    if (created.lineCount < 1) {
      throw new Error(
        `demo pay run ${run.id}: createRun produced 0 lines (no period members?)`
      );
    }
  }

  await recordSeedFiles(db, [file]);
}

/**
 * Custom employee-profile fields. Idempotent and always refreshed on
 * re-seed — unlike an approved rule pack, these are admin config, not a
 * statutory figure someone has signed off on.
 */
async function seedEmployeeCustomFields(db: Database): Promise<void> {
  const file = read<EmployeeCustomFieldSeed>("employee-custom-fields.json");
  for (const field of file.data.fields) {
    await db
      .insert(employeeCustomFieldDefs)
      .values({
        fieldKey: field.fieldKey,
        label: field.label,
        dataType: field.dataType,
        required: field.required,
        sortOrder: field.sortOrder,
        active: field.active,
      })
      .onConflictDoUpdate({
        target: employeeCustomFieldDefs.fieldKey,
        set: {
          label: field.label,
          dataType: field.dataType,
          required: field.required,
          sortOrder: field.sortOrder,
          active: field.active,
        },
      });
  }
  await recordSeedFiles(db, [file]);
}

interface SourceCaptureSeed {
  rulePack: {
    id: string;
    name: string;
    layer: "EMPLOYMENT_LAW" | "STATUTORY_CALCULATION";
    authority: string;
    code: string;
    version: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    notes: string;
  };
  sources: Array<{
    ref: string;
    issuer: string;
    title: string;
    url: string;
    retrievedAt: string;
    instrumentNumber: string | null;
    provisionReference: string | null;
    pageReference: string | null;
    publishedDate: string | null;
    effectiveDate: string | null;
    sha256: string | null;
  }>;
}

/**
 * The employment-law instruments, captured but not verified.
 *
 * This pack stays at SOURCE_CAPTURED and holds no rules at all: the working-time
 * and wage-floor figures live in instruments published as PDFs, and a value is
 * only written once a reviewer has read the provision and said so. Until then
 * the register names what must be read, and the database refuses to let any
 * payroll near the pack.
 */
async function seedSourceCapturePack(
  db: Database,
  fileName: string
): Promise<void> {
  const file = read<SourceCaptureSeed>(fileName);
  const pack = file.data.rulePack;

  await db.transaction(async (tx) => {
    /**
     * `setWhere` keeps this an update, not just an insert-or-skip: a fixed
     * title, URL, or note in the source JSON should reach the register on the
     * next seed run. It stops short of `status`, so a pack a reviewer has
     * already moved past SOURCE_CAPTURED cannot be quietly reset by re-running
     * this script.
     */
    await tx
      .insert(rulePacks)
      .values({
        id: pack.id,
        name: pack.name,
        layer: pack.layer,
        jurisdiction: "MY",
        authority: pack.authority,
        code: pack.code,
        version: pack.version,
        effectiveFrom: pack.effectiveFrom,
        effectiveTo: pack.effectiveTo,
        status: "SOURCE_CAPTURED",
        notes: pack.notes,
      })
      .onConflictDoUpdate({
        target: rulePacks.id,
        set: {
          name: pack.name,
          authority: pack.authority,
          code: pack.code,
          version: pack.version,
          effectiveFrom: pack.effectiveFrom,
          effectiveTo: pack.effectiveTo,
          notes: pack.notes,
        },
        setWhere: sql`${rulePacks.status} = 'SOURCE_CAPTURED'`,
      });

    for (const source of file.data.sources) {
      /**
       * Same reasoning per source: a corrected title or URL should propagate,
       * but a source a reviewer has already verified is evidence someone
       * attested to — the file changing underneath it must not silently
       * rewrite what they signed off on. `setWhere` makes that case a no-op
       * instead of a silent overwrite.
       */
      await tx
        .insert(ruleSources)
        .values({
          rulePackId: pack.id,
          ref: source.ref,
          issuer: source.issuer,
          title: source.title,
          url: source.url,
          retrievedAt: source.retrievedAt,
          instrumentNumber: source.instrumentNumber,
          provisionReference: source.provisionReference,
          pageReference: source.pageReference,
          publishedDate: source.publishedDate,
          effectiveDate: source.effectiveDate,
          sha256: source.sha256,
        })
        .onConflictDoUpdate({
          target: [ruleSources.rulePackId, ruleSources.ref],
          set: {
            issuer: source.issuer,
            title: source.title,
            url: source.url,
            retrievedAt: source.retrievedAt,
            instrumentNumber: source.instrumentNumber,
            provisionReference: source.provisionReference,
            pageReference: source.pageReference,
            publishedDate: source.publishedDate,
            effectiveDate: source.effectiveDate,
            sha256: source.sha256,
          },
          setWhere: sql`${ruleSources.verifiedBy} IS NULL`,
        });
    }
  });

  await recordSeedFiles(db, [file]);
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
