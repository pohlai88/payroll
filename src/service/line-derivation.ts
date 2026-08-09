/**
 * Compute-on-read derivation graph for one pay line.
 * Loads the same inputs as recompute, emits `deriveLine`, maps to the FE
 * `DerivedNode` tree shape consumed by `NodePanel`.
 */

import type { Database } from "@/db/client";
import { validateLineInputs } from "@/domain/calc/validate";
import { type DeriveOptions, deriveLine } from "@/domain/derive/emit";
import type { DerivationGraph, RootKey } from "@/domain/derive/graph";
import { renderLabel } from "@/domain/derive/i18n/render";
import type { DerivationNode, NodeId } from "@/domain/derive/node";
import type { NodeValue } from "@/domain/derive/value";
import { loadRunForCompute } from "@/repo/pay-run";
import {
  loadPayItems,
  loadRuleSettings,
  loadStatutoryTables,
} from "@/repo/rule-pack";
import { ControlError } from "@/service/control-errors";

/** Keep in sync with `src/components/payroll/node-panel.tsx` `DerivedNode`. */
export interface DerivedNodeDto {
  readonly key: string;
  readonly kind:
    | "FORMULA"
    | "TABLE_LOOKUP"
    | "RATE"
    | "CAP"
    | "OVERRIDE"
    | "PASSTHROUGH"
    | "NOT_APPLICABLE";
  readonly label: {
    readonly key: string;
    readonly params?: Record<string, string | number>;
  };
  readonly sen: number | null;
  readonly citation: {
    readonly ruleId: string;
    readonly authority: string;
    readonly reference: string;
    readonly effectiveDate: string;
    readonly displayText: string;
  } | null;
  readonly citationStatus: "RESOLVED" | "UNRESOLVED";
  readonly flags: Array<"REVIEW_REQUIRED" | "UNVERIFIED" | "NOT_ENTERED">;
  readonly children?: DerivedNodeDto[];
}

export interface LineDerivationDto {
  readonly runId: string;
  readonly lineId: string;
  readonly employmentId: string;
  readonly root: string;
  readonly rootKeys: readonly string[];
  readonly node: DerivedNodeDto | null;
}

function senOf(value: NodeValue): number | null {
  if (value.t === "SEN") {
    return value.sen;
  }
  if (value.t === "EXACT_SEN") {
    return value.approxSen;
  }
  if (value.t === "SEN_UNKNOWN") {
    return null;
  }
  return null;
}

function mapKind(kind: DerivationNode["kind"]): DerivedNodeDto["kind"] {
  switch (kind) {
    case "TABLE_LOOKUP":
      return "TABLE_LOOKUP";
    case "NOT_APPLICABLE":
      return "NOT_APPLICABLE";
    case "MANUAL_OVERRIDE":
      return "OVERRIDE";
    case "SETTING":
      return "RATE";
    case "CALCULATION":
    case "ROUNDING":
    case "PRORATION":
    case "AGGREGATE":
      return "FORMULA";
    default:
      return "PASSTHROUGH";
  }
}

function mapFlags(flags: DerivationNode["flags"]): DerivedNodeDto["flags"] {
  if (!flags) {
    return [];
  }
  const out: DerivedNodeDto["flags"] = [];
  for (const f of flags) {
    if (f === "REVIEW_REQUIRED" || f === "UNVERIFIED" || f === "NOT_ENTERED") {
      out.push(f);
    }
  }
  return out;
}

function toDerivedNode(
  graph: DerivationGraph,
  nodeId: NodeId,
  seen: Set<string>
): DerivedNodeDto | null {
  if (seen.has(nodeId)) {
    return null;
  }
  seen.add(nodeId);
  const node = graph.nodes[nodeId];
  if (!node) {
    return null;
  }

  const [citation0] = node.citations;
  const citation = citation0
    ? {
        ruleId: citation0.ruleId,
        authority: citation0.sourceRef,
        reference: citation0.clause?.locator ?? citation0.ruleId,
        effectiveDate: "",
        displayText: citation0.ruleId,
      }
    : null;

  const children: DerivedNodeDto[] = [];
  for (const ref of node.inputs) {
    const child = toDerivedNode(graph, ref.nodeId, seen);
    if (child) {
      children.push(child);
    }
  }

  return {
    key: node.id,
    kind: mapKind(node.kind),
    label: {
      key: renderLabel(node.label, "en"),
      ...(node.detail
        ? { params: { detail: renderLabel(node.detail, "en") } }
        : {}),
    },
    sen: senOf(node.value),
    citation,
    citationStatus: citation ? "RESOLVED" : "UNRESOLVED",
    flags: mapFlags(node.flags),
    ...(children.length > 0 ? { children } : {}),
  };
}

export interface LineGraphResult {
  readonly runId: string;
  readonly lineId: string;
  readonly employmentId: string;
  readonly graph: DerivationGraph;
}

/**
 * Compute-on-read derivation graph for one line. Shared by the derivation
 * drawer endpoint and run-vs-run graph diff — `pay_lines.trace` is a flat
 * TraceStep[] audit list, not a DerivationGraph.
 */
export async function loadDerivedGraph(
  db: Database,
  runId: string,
  lineId: string
): Promise<LineGraphResult> {
  const run = await loadRunForCompute(db, runId);
  const line = run.lines.find((l) => l.lineId === lineId);
  if (!line) {
    throw new ControlError("NOT_FOUND", `no such line: ${lineId}`);
  }

  // Wall before deriveLine: classify tripwires throw raw Errors on bypass.
  // Map calc validation to ControlError so the drawer gets a 400, not a 500.
  const issues = validateLineInputs(line.employee, line.inputs);
  if (issues.length > 0) {
    throw new ControlError(
      "VALIDATION_ERROR",
      issues.map((i) => `${i.path}: ${i.message}`).join("; ")
    );
  }

  const [tables, settings, catalog] = await Promise.all([
    loadStatutoryTables(db, run.rulePackId),
    loadRuleSettings(db, run.rulePackId),
    loadPayItems(db),
  ]);

  const opts: DeriveOptions = {
    rulePackId: run.rulePackId,
    employee: line.employee,
    inputs: line.inputs,
    payItems: catalog,
    tables,
    settings,
    overrides: line.overrides,
    pcb: line.pcb,
  };

  return {
    runId,
    lineId,
    employmentId: line.employmentId,
    graph: deriveLine(opts),
  };
}

export async function getLineDerivation(
  db: Database,
  runId: string,
  lineId: string,
  root: string | undefined
): Promise<LineDerivationDto> {
  const { employmentId, graph } = await loadDerivedGraph(db, runId, lineId);
  const rootKeys = Object.keys(graph.roots) as RootKey[];
  const selectedRoot: RootKey | "" =
    root !== undefined && root in graph.roots
      ? (root as RootKey)
      : (rootKeys[0] ?? "");
  const rootNodeId =
    selectedRoot === "" ? undefined : graph.roots[selectedRoot];
  const node =
    rootNodeId === undefined
      ? null
      : toDerivedNode(graph, rootNodeId, new Set());

  return {
    runId,
    lineId,
    employmentId,
    root: selectedRoot,
    rootKeys,
    node,
  };
}
