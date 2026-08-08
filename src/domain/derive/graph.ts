/**
 * The derivation graph: a flat map of nodes, a deterministic emit order, and a
 * set of named roots.
 *
 * Flat rather than nested because this is a directed acyclic graph, not a tree,
 * and the sharing is the point — one EPF band lookup feeds both the employee and
 * the employer figure, so the schedule row highlights once. A nested tree would
 * duplicate it and quietly break the promise that the same number is the same
 * node. Flatness also gives O(1) access for deep links and makes a diff between
 * two pay runs a keyed map difference.
 */

import type { DerivationNode, NodeId, Ref } from "./node";
import { senOf, type NodeValue } from "./value";

/** One per money field of `LineResult`. This mapping is the bridge to the golden master. */
export type RootKey =
  | "gross"
  | "epfWages"
  | "socsoWages"
  | "eisWages"
  | "epfEe"
  | "epfEr"
  | "socsoEeCore"
  | "socsoEeSkbbk"
  | "socsoEr"
  | "eisEe"
  | "eisEr"
  | "pcbNet"
  | "cp38"
  | "zakat"
  | "otherDeductions"
  | "deductionsTotal"
  | "net"
  | "hrdfLevy"
  | "employerCost";

export const ROOT_KEYS: readonly RootKey[] = [
  "gross",
  "epfWages",
  "socsoWages",
  "eisWages",
  "epfEe",
  "epfEr",
  "socsoEeCore",
  "socsoEeSkbbk",
  "socsoEr",
  "eisEe",
  "eisEr",
  "pcbNet",
  "cp38",
  "zakat",
  "otherDeductions",
  "deductionsTotal",
  "net",
  "hrdfLevy",
  "employerCost",
];

export interface DerivationGraph {
  readonly schemaVersion: 1;
  readonly rulePackId: string;
  readonly nodes: Readonly<Record<NodeId, DerivationNode>>;
  /** Topological emit order — rendering, serialization and hashing all follow it. */
  readonly order: readonly NodeId[];
  readonly roots: Readonly<Partial<Record<RootKey, NodeId>>>;
}

/**
 * Builds a graph, enforcing the id discipline as it goes.
 *
 * Ids are semantic paths (`line.epf.ee`), never content hashes, so the same
 * figure keeps the same id across months and a diff reads as "EPF employee moved
 * from RM517.00 to RM528.00". Two rules make the result deterministic and
 * acyclic by construction: an id may be emitted only once, and every input must
 * already exist when the node referencing it is emitted.
 */
export class GraphBuilder {
  private readonly nodes = new Map<NodeId, DerivationNode>();
  private readonly emitOrder: NodeId[] = [];
  private readonly rootMap = new Map<RootKey, NodeId>();

  constructor(private readonly rulePackId: string) {}

  has(id: NodeId): boolean {
    return this.nodes.has(id);
  }

  get(id: NodeId): DerivationNode {
    const n = this.nodes.get(id);
    if (n === undefined) throw new Error(`no such node: ${id}`);
    return n;
  }

  add<T extends DerivationNode>(node: T): NodeId {
    if (this.nodes.has(node.id)) {
      throw new Error(`duplicate node id: ${node.id}`);
    }
    for (const ref of node.inputs) {
      if (!this.nodes.has(ref.nodeId)) {
        throw new Error(`node ${node.id} references ${ref.nodeId}, which has not been emitted`);
      }
    }
    this.nodes.set(node.id, node);
    this.emitOrder.push(node.id);
    return node.id;
  }

  /** Name a node as a root. Roots are the only nodes the rest of the system reads by name. */
  root(key: RootKey, id: NodeId): NodeId {
    if (!this.nodes.has(id)) throw new Error(`root ${key} points at unknown node ${id}`);
    this.rootMap.set(key, id);
    return id;
  }

  /**
   * Disambiguate repeated pay item codes deterministically: the same inputs must
   * always produce the same ids, so this suffixes rather than counts globally.
   */
  uniqueId(base: NodeId): NodeId {
    if (!this.nodes.has(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base}#${n}`;
      if (!this.nodes.has(candidate)) return candidate;
    }
  }

  build(): DerivationGraph {
    return {
      schemaVersion: 1,
      rulePackId: this.rulePackId,
      nodes: Object.fromEntries(this.nodes),
      order: [...this.emitOrder],
      roots: Object.fromEntries(this.rootMap) as Partial<Record<RootKey, NodeId>>,
    };
  }
}

export function nodeAt(graph: DerivationGraph, id: NodeId): DerivationNode {
  const n = graph.nodes[id];
  if (n === undefined) throw new Error(`no such node: ${id}`);
  return n;
}

export function rootValue(graph: DerivationGraph, key: RootKey): NodeValue | undefined {
  const id = graph.roots[key];
  return id === undefined ? undefined : nodeAt(graph, id).value;
}

/**
 * The settled sen figure at a root, or null when it is genuinely unknown.
 * A root that was never emitted is a bug in the emitter, not a zero.
 */
export function readSen(graph: DerivationGraph, key: RootKey): number | null {
  const v = rootValue(graph, key);
  if (v === undefined) throw new Error(`graph has no root: ${key}`);
  return senOf(v);
}

/** Direct inputs of a node, resolved. */
export function inputsOf(graph: DerivationGraph, id: NodeId): Array<{ ref: Ref; node: DerivationNode }> {
  return nodeAt(graph, id).inputs.map((ref) => ({ ref, node: nodeAt(graph, ref.nodeId) }));
}

/**
 * Canonical JSON for hashing and for the determinism test. Key order follows the
 * emit order rather than insertion or alphabetical order, so two runs of the same
 * inputs serialize byte-identically.
 */
export function canonicalJson(graph: DerivationGraph): string {
  return JSON.stringify({
    schemaVersion: graph.schemaVersion,
    rulePackId: graph.rulePackId,
    order: graph.order,
    roots: Object.fromEntries([...Object.entries(graph.roots)].sort(([a], [b]) => (a < b ? -1 : 1))),
    nodes: graph.order.map((id) => sortKeys(nodeAt(graph, id))),
  });
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : 1
    );
    return Object.fromEntries(entries.map(([k, v]) => [k, sortKeys(v)]));
  }
  return value;
}
