/**
 * Differences between two derivation graphs.
 *
 * This is what semantic node ids buy. Because `line.epf.ee` is `line.epf.ee` in
 * June and in July, comparing two months is a keyed map difference rather than a
 * tree alignment problem — and the result reads as an explanation:
 *
 *   VALUE     line.wages.epf      +150.00
 *   VALUE     line.epf.band        row 233 → row 236
 *   VALUE     line.epf.ee          +6.00
 *   STRUCTURE line.gross           + line.earn.INCENTIVE
 *
 * That is month-over-month variance explained, with no separate variance engine.
 * Content-hashed ids would have made every node change every month and produced
 * nothing but noise.
 */

import type { Citation } from "./citation";
import { type DerivationGraph } from "./graph";
import type { DerivationNode, NodeId, Ref } from "./node";
import type { NodeValue } from "./value";

export type NodeDiff =
  | { readonly d: "ADDED"; readonly id: NodeId; readonly to: DerivationNode }
  | { readonly d: "REMOVED"; readonly id: NodeId; readonly from: DerivationNode }
  | {
      readonly d: "VALUE";
      readonly id: NodeId;
      readonly from: NodeValue;
      readonly to: NodeValue;
      /** Present only when both sides are settled money. */
      readonly deltaSen?: number;
    }
  | {
      readonly d: "STRUCTURE";
      readonly id: NodeId;
      readonly added: readonly Ref[];
      readonly removed: readonly Ref[];
    }
  /** The rule pack changed under this node — the statute itself moved. */
  | {
      readonly d: "CITATION";
      readonly id: NodeId;
      readonly from: readonly Citation[];
      readonly to: readonly Citation[];
    };

function sameValue(a: NodeValue, b: NodeValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameCitations(a: readonly Citation[], b: readonly Citation[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function refKey(r: Ref): string {
  return `${r.nodeId}:${r.role}`;
}

function settledSen(v: NodeValue): number | null {
  return v.t === "SEN" ? v.sen : null;
}

export function diffGraphs(from: DerivationGraph, to: DerivationGraph): NodeDiff[] {
  const out: NodeDiff[] = [];
  const ids = new Set<NodeId>([...Object.keys(from.nodes), ...Object.keys(to.nodes)]);

  // Report in the newer graph's emit order so the diff reads top-down like the
  // payslip does, with anything only in the old graph appended.
  const ordered = [...to.order, ...[...ids].filter((id) => !to.order.includes(id))];

  for (const id of ordered) {
    const a = from.nodes[id];
    const b = to.nodes[id];

    if (a === undefined && b !== undefined) {
      out.push({ d: "ADDED", id, to: b });
      continue;
    }
    if (a !== undefined && b === undefined) {
      out.push({ d: "REMOVED", id, from: a });
      continue;
    }
    if (a === undefined || b === undefined) continue;

    if (!sameValue(a.value, b.value)) {
      const fromSen = settledSen(a.value);
      const toSen = settledSen(b.value);
      out.push({
        d: "VALUE",
        id,
        from: a.value,
        to: b.value,
        ...(fromSen !== null && toSen !== null ? { deltaSen: toSen - fromSen } : {}),
      });
    }

    const aRefs = new Map(a.inputs.map((r) => [refKey(r), r]));
    const bRefs = new Map(b.inputs.map((r) => [refKey(r), r]));
    const added = [...bRefs].filter(([k]) => !aRefs.has(k)).map(([, r]) => r);
    const removed = [...aRefs].filter(([k]) => !bRefs.has(k)).map(([, r]) => r);
    if (added.length > 0 || removed.length > 0) {
      out.push({ d: "STRUCTURE", id, added, removed });
    }

    if (!sameCitations(a.citations, b.citations)) {
      out.push({ d: "CITATION", id, from: a.citations, to: b.citations });
    }
  }

  return out;
}

/** True when nothing about the derivation moved — same figures, same shape, same sources. */
export function graphsIdentical(from: DerivationGraph, to: DerivationGraph): boolean {
  return diffGraphs(from, to).length === 0;
}
