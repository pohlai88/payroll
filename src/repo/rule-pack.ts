/**
 * Loads a rule pack out of the database as the engine's own types.
 *
 * Everything the calculators need — band tables, settings, the pay item matrix —
 * comes back shaped exactly as `src/domain/calc/types.ts` declares it, so no
 * caller ever assembles engine input by hand.
 */

import { asc, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { payItems } from "@/db/schema/catalog";
import {
  eisBands,
  epfBands,
  ruleSettings,
  socsoBands,
} from "@/db/schema/rule-pack";
import type {
  Band5,
  PayItemDef,
  RuleSettings,
  SocsoBand,
  StatutoryTables,
} from "@/domain/calc/types";
import {
  type PersistedRuleSettings,
  parseRuleSettings,
  toEngineSettings,
} from "./rule-pack-schema";

export async function loadStatutoryTables(
  db: Database,
  rulePackId: string
): Promise<StatutoryTables> {
  const [epfRows, socsoRows, eisRows] = await Promise.all([
    db
      .select({
        part: epfBands.part,
        fromSen: epfBands.fromSen,
        toSen: epfBands.toSen,
        erSen: epfBands.erSen,
        eeSen: epfBands.eeSen,
      })
      .from(epfBands)
      .where(eq(epfBands.rulePackId, rulePackId))
      .orderBy(asc(epfBands.part), asc(epfBands.fromSen)),
    db
      .select({
        fromSen: socsoBands.fromSen,
        toSen: socsoBands.toSen,
        cat1ErSen: socsoBands.cat1ErSen,
        cat1EeCoreSen: socsoBands.cat1EeCoreSen,
        cat1EeSkbbkSen: socsoBands.cat1EeSkbbkSen,
        cat2ErSen: socsoBands.cat2ErSen,
        cat2EeSkbbkSen: socsoBands.cat2EeSkbbkSen,
      })
      .from(socsoBands)
      .where(eq(socsoBands.rulePackId, rulePackId))
      .orderBy(asc(socsoBands.fromSen)),
    db
      .select({
        fromSen: eisBands.fromSen,
        toSen: eisBands.toSen,
        erSen: eisBands.erSen,
        eeSen: eisBands.eeSen,
      })
      .from(eisBands)
      .where(eq(eisBands.rulePackId, rulePackId))
      .orderBy(asc(eisBands.fromSen)),
  ]);

  const epf: Record<"A" | "C" | "E", Band5[]> = { A: [], C: [], E: [] };
  for (const row of epfRows) {
    // The CHECK constraint confines the column to A, C and E; this narrows it.
    if (row.part === "A" || row.part === "C" || row.part === "E") {
      epf[row.part].push({
        fromSen: row.fromSen,
        toSen: row.toSen,
        erSen: row.erSen,
        eeSen: row.eeSen,
      });
    }
  }

  assertBandsPresent(epf.A, `${rulePackId} EPF Part A`);
  assertBandsPresent(epf.C, `${rulePackId} EPF Part C`);
  assertBandsPresent(epf.E, `${rulePackId} EPF Part E`);
  assertBandsPresent(socsoRows, `${rulePackId} SOCSO`);
  assertBandsPresent(eisRows, `${rulePackId} EIS`);

  return { epf, socso: socsoRows as SocsoBand[], eis: eisRows as Band5[] };
}

/**
 * An empty band table would not throw — it would silently contribute zero, which
 * is a wrong payslip rather than an error. Absence is a misconfigured pack.
 */
function assertBandsPresent(rows: readonly unknown[], what: string): void {
  if (rows.length === 0) {
    throw new Error(`rule pack has no bands for ${what}`);
  }
}

async function loadPersistedSettings(
  db: Database,
  rulePackId: string
): Promise<PersistedRuleSettings> {
  const [row] = await db
    .select({ settings: ruleSettings.settings })
    .from(ruleSettings)
    .where(eq(ruleSettings.rulePackId, rulePackId))
    .limit(1);

  if (row === undefined) {
    throw new Error(`rule pack ${rulePackId} has no settings row`);
  }
  return parseRuleSettings(row.settings, rulePackId);
}

export async function loadRuleSettings(
  db: Database,
  rulePackId: string
): Promise<RuleSettings> {
  return toEngineSettings(await loadPersistedSettings(db, rulePackId));
}

/**
 * The pay item matrix as the engine reads it.
 *
 * Inactive items are included: a historical line may reference an item that has
 * since been deactivated, and the engine needs its definition to resolve that
 * line at all. Deactivation governs what may be newly *entered*, not what can be
 * explained.
 */
/**
 * Canonical pay-item definitions for compute.
 *
 * Wage-base authority: `pay_item_treatments` (EPF/SOCSO/EIS/HRD) wins when a
 * current treatment row exists. Catalog booleans `pay_items.epf_wages` /
 * `socso_wages` / `eis_wages` are deprecated mirrors kept in sync by trigger for
 * EPF/SOCSO/EIS only — HRD has no catalog mirror and exists only in treatments.
 * PCB class comes from `pay_item_pcb_classes`, not `pay_items.taxable`.
 */
export async function loadPayItems(db: Database): Promise<PayItemDef[]> {
  const rows = await db
    .select({
      id: payItems.id,
      code: payItems.code,
      kind: payItems.kind,
      rateBasis: payItems.rateBasis,
      epfWages: payItems.epfWages,
      socsoWages: payItems.socsoWages,
      eisWages: payItems.eisWages,
      prorates: payItems.prorates,
    })
    .from(payItems)
    .orderBy(asc(payItems.sort), asc(payItems.code));

  if (rows.length === 0) {
    throw new Error(
      "no pay items are defined: the catalog has not been seeded"
    );
  }

  const treatmentRows = await db.execute<{
    pay_item_id: string;
    scheme: string;
    subject: boolean;
  }>(sql`
    SELECT DISTINCT ON (pay_item_id, scheme)
      pay_item_id, scheme, subject
    FROM pay_item_treatments
    WHERE effective_to IS NULL OR effective_to >= CURRENT_DATE
    ORDER BY pay_item_id, scheme, effective_from DESC`);

  const pcbRows = await db.execute<{
    pay_item_id: string;
    class: string;
  }>(sql`
    SELECT DISTINCT ON (pay_item_id)
      pay_item_id, class
    FROM pay_item_pcb_classes
    WHERE effective_to IS NULL OR effective_to >= CURRENT_DATE
    ORDER BY pay_item_id, effective_from DESC`);

  type Scheme = "EPF" | "SOCSO" | "EIS" | "HRD";
  const subjectByItem = new Map<string, Partial<Record<Scheme, boolean>>>();
  for (const t of treatmentRows.rows) {
    const scheme = t.scheme as Scheme;
    const cur = subjectByItem.get(t.pay_item_id) ?? {};
    cur[scheme] = t.subject;
    subjectByItem.set(t.pay_item_id, cur);
  }
  const pcbByItem = new Map<
    string,
    NonNullable<PayItemDef["pcbRemunerationClass"]>
  >();
  for (const p of pcbRows.rows) {
    pcbByItem.set(
      p.pay_item_id,
      p.class as NonNullable<PayItemDef["pcbRemunerationClass"]>
    );
  }

  return rows.map((r) => {
    const subjects = subjectByItem.get(r.id) ?? {};
    return {
      code: r.code,
      kind: r.kind,
      rateBasis: r.rateBasis,
      // Treatments are authority; boolean columns are deprecated mirrors.
      epfWages: subjects.EPF ?? r.epfWages,
      socsoWages: subjects.SOCSO ?? r.socsoWages,
      eisWages: subjects.EIS ?? r.eisWages,
      hrdWages: subjects.HRD ?? r.epfWages,
      prorates: r.prorates,
      pcbRemunerationClass:
        pcbByItem.get(r.id) ?? defaultPcbRemunerationClass(r.kind, r.code),
    };
  });
}

function defaultPcbRemunerationClass(
  kind: string,
  code: string
): NonNullable<PayItemDef["pcbRemunerationClass"]> {
  if (kind === "DEDUCTION") {
    return "EXCLUDED";
  }
  if (code === "BONUS") {
    return "ADDITIONAL";
  }
  return "NORMAL";
}
