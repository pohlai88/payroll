/**
 * Prints the derivation of one figure, recursively, for a fixture employee.
 *
 *   npx tsx scripts/explain.ts [employeeId] [rootKey] [en|ms]
 *
 * A development aid, and the quickest way to see whether the graph actually
 * answers "why is this number what it is?" down to a cited source.
 */

import fs from "node:fs";
import path from "node:path";
import { deriveLine } from "../src/domain/derive/emit";
import { nodeAt, type DerivationGraph, type RootKey } from "../src/domain/derive/graph";
import { renderLabel, type Lang } from "../src/domain/derive/i18n/render";
import { formatRM } from "../src/domain/money";
import type { LineItemInput } from "../src/domain/calc/types";
import { loadTables, loadPayItems, defaultSettings, makeEmployee } from "../tests/helpers";

const [, , wantId, wantRoot = "net", langArg = "en"] = process.argv;
const lang = langArg as Lang;

const fixture = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "tests", "golden", "july-2026.json"), "utf8")
) as {
  periodEnd: string;
  workingDays: number;
  paidDays: number;
  employees: Array<{
    id: string;
    name: string;
    dob: string;
    basicSen: number;
    epfEligible: boolean;
    socsoEligible: boolean;
    eisEligible: boolean;
    eisPriorContribution: boolean;
    allowances: Record<string, number>;
    mealRateSen: number;
    mealDays: number;
  }>;
};

const e = wantId ? fixture.employees.find((x) => x.id === wantId) : fixture.employees[0];
if (!e) {
  console.error(`no such employee: ${wantId}`);
  console.error(`available: ${fixture.employees.map((x) => x.id).join(", ")}`);
  process.exit(1);
}

const items: LineItemInput[] = [];
for (const [code, amountSen] of Object.entries(e.allowances)) {
  if (amountSen > 0) items.push({ payItemCode: code, amountSen });
}
if (e.mealDays > 0 && e.mealRateSen > 0) {
  items.push({
    payItemCode: "MEAL",
    qty: e.mealDays,
    rateSen: e.mealRateSen,
    amountSen: e.mealDays * e.mealRateSen,
  });
}

const graph = deriveLine({
  rulePackId: "MY-STATUTORY-2026-06",
  employee: makeEmployee({
    id: e.id,
    name: e.name,
    dob: e.dob,
    baseRateSen: e.basicSen,
    epfApplicable: e.epfEligible,
    socsoApplicable: e.socsoEligible,
    eisApplicable: e.eisEligible,
    eisPriorContribution: e.eisPriorContribution,
    pcbApplicable: true,
  }),
  inputs: {
    workingDays: fixture.workingDays,
    paidDays: fixture.paidDays,
    mealDays: e.mealDays,
    hoursWorked: null,
    otHours: 0,
    otRateSen: 0,
    items,
    periodEnd: fixture.periodEnd,
  },
  payItems: loadPayItems(),
  tables: loadTables(),
  settings: defaultSettings(),
  pcb: { pcbAmountSen: 0, zakatOffsetSen: 0, cp38Sen: 0, verified: true },
  hrdfLevyEnabled: true,
  hrdfLevyPct: 1,
});

function show(value: (typeof graph.nodes)[string]["value"]): string {
  switch (value.t) {
    case "SEN":
      return formatRM(value.sen);
    case "EXACT_SEN":
      return `${(value.exact.num / value.exact.den / 100).toFixed(6)} (unrounded)`;
    case "SEN_UNKNOWN":
      return "— unknown";
    case "ROW":
      return `band ${formatRM(value.row.fromSen)}–${formatRM(value.row.toSen)} → ${Object.entries(
        value.row.columns
      )
        .map(([k, v]) => `${k} ${formatRM(v)}`)
        .join(", ")}`;
    case "ENUM":
      return renderLabel({ key: `enum.${value.domain}.${value.code}` }, lang);
    case "BOOL":
      return value.value ? "yes" : "no";
    case "COUNT":
      return `${value.value} ${value.unit.toLowerCase()}`;
    case "RATE_PCT":
      return `${value.pctX100 / 100}%`;
    case "DATE":
      return value.iso;
  }
}

function drill(
  g: DerivationGraph,
  id: string,
  prefix: string | null,
  last: boolean,
  seen: Set<string>
): void {
  const n = nodeAt(g, id);
  const root = prefix === null;
  const branch = root ? "" : last ? "└─ " : "├─ ";
  const pad = prefix ?? "";
  const repeat = seen.has(id);
  console.log(
    `${pad}${branch}${renderLabel(n.label, lang)}  ${show(n.value)}${repeat ? "   (shown above)" : ""}`
  );
  const childPrefix = root ? "" : pad + (last ? "   " : "│  ");

  if (repeat) return;
  seen.add(id);

  const notes: string[] = [];
  if (n.detail) notes.push(renderLabel(n.detail, lang));
  for (const c of n.citations) {
    notes.push(`[${c.sourceRef}] ${c.ruleId}${c.clause?.locator ? ` · ${c.clause.locator}` : ""}`);
  }
  if (n.flags?.length) notes.push(`flags: ${n.flags.join(", ")}`);
  for (const note of notes) console.log(`${childPrefix}   ${note}`);

  const included = n.inputs.filter((r) => r.role !== "EXCLUDED");
  const excluded = n.inputs.filter((r) => r.role === "EXCLUDED");
  for (const [i, ref] of included.entries()) {
    drill(g, ref.nodeId, childPrefix, i === included.length - 1 && excluded.length === 0, seen);
  }
  for (const [i, ref] of excluded.entries()) {
    const child = nodeAt(g, ref.nodeId);
    const mark = i === excluded.length - 1 ? "└─ " : "├─ ";
    console.log(
      `${childPrefix}${mark}(excluded) ${renderLabel(child.label, lang)}  ${show(child.value)} — ${
        ref.because ? renderLabel(ref.because, lang) : "no reason given"
      }`
    );
  }
}

console.log(`\n${e.id}  ${e.name}   ·   period ending ${fixture.periodEnd}   ·   ${lang}`);
console.log(`rule pack ${graph.rulePackId}   ·   ${graph.order.length} nodes\n`);

const rootId = graph.roots[wantRoot as RootKey];
if (rootId === undefined) {
  console.error(`no such root: ${wantRoot}`);
  console.error(`available: ${Object.keys(graph.roots).join(", ")}`);
  process.exit(1);
}
drill(graph, rootId, null, true, new Set());
console.log();
