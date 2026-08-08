import fs from "node:fs";
import path from "node:path";
import type {
  Band5,
  EmployeeSnapshot,
  PayItemDef,
  RuleSettings,
  SocsoBand,
  StatutoryTables,
} from "@/domain/calc/types";

const SEED = path.join(process.cwd(), "db", "seed");

function readJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(SEED, name), "utf8")) as T;
}

export function loadTables(): StatutoryTables {
  return {
    epf: {
      A: readJson<Band5[]>("epf-part-a.json"),
      C: readJson<Band5[]>("epf-part-c.json"),
      E: readJson<Band5[]>("epf-part-e.json"),
    },
    socso: readJson<SocsoBand[]>("socso-skbbk.json"),
    eis: readJson<Band5[]>("eis.json"),
  };
}

export function loadPayItems(): PayItemDef[] {
  const items = readJson<
    Array<{ code: string; kind: "EARNING" | "DEDUCTION"; epfWages: number; socsoWages: number; eisWages: number }>
  >("pay-item-matrix.json");
  return items.map((i) => ({
    code: i.code,
    kind: i.kind,
    epfWages: !!i.epfWages,
    socsoWages: !!i.socsoWages,
    eisWages: !!i.eisWages,
  }));
}

/**
 * A missing statutory setting is a misconfigured rule pack, not a default —
 * fail loudly rather than let `undefined` reach the engine.
 */
function required(settings: Record<string, string>, key: string): string {
  const v = settings[key];
  if (v === undefined) throw new Error(`rule pack is missing setting: ${key}`);
  return v;
}

export function defaultSettings(): RuleSettings {
  const meta = readJson<{ settings: Record<string, string> }>("rule-pack-meta.json");
  const s = meta.settings;
  return {
    epfTableCeilingSen: Number(s["epf.table_ceiling_sen"]),
    epfAboveEePct: Number(s["epf.above.ee_pct"]),
    epfAboveErPctLeThreshold: Number(s["epf.above.er_pct_le_threshold"]),
    epfAboveErPctGtThreshold: Number(s["epf.above.er_pct_gt_threshold"]),
    epfErThresholdSen: Number(s["epf.er_threshold_sen"]),
    epfPartCAboveEePct: Number(s["epf.partC.above.ee_pct"]),
    epfPartCAboveErPct: Number(s["epf.partC.above.er_pct"]),
    epfPartEAboveEePct: Number(s["epf.partE.above.ee_pct"]),
    epfPartEAboveErPct: Number(s["epf.partE.above.er_pct"]),
    epfPartFEePct: Number(s["epf.partF.ee_pct"]),
    epfPartFErPct: Number(s["epf.partF.er_pct"]),
    socsoCeilingSen: Number(s["socso.ceiling_sen"]),
    skbbkPhaseFrom: required(s, "skbbk.phase_from"),
    skbbkPhaseTo: required(s, "skbbk.phase_to"),
    eisCeilingSen: Number(s["eis.ceiling_sen"]),
    eisMinAge: Number(s["eis.min_age"]),
    eisMaxAgeExclusive: Number(s["eis.max_age_exclusive"]),
    eisFirstTimeReviewAge: Number(s["eis.first_time_review_age"]),
    hrdfLevyPct: Number(s["hrdf.levy_pct"]),
  };
}

export function makeEmployee(partial: Partial<EmployeeSnapshot> = {}): EmployeeSnapshot {
  return {
    id: "TEST001",
    name: "TEST EMPLOYEE",
    isMalaysian: true,
    isPermanentResident: false,
    dob: "1990-01-15",
    payBasis: "MONTHLY",
    baseRateSen: 350000,
    epfApplicable: true,
    socsoApplicable: true,
    eisApplicable: true,
    pcbApplicable: true,
    epfMemberBeforeAug1998: null,
    eisPriorContribution: true,
    epfPartOverride: null,
    socsoCategoryOverride: null,
    ...partial,
  };
}
