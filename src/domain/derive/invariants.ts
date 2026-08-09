/**
 * @feature derivation
 * @layer domain
 *
 * The properties that make the graph trustworthy, expressed as assertions.
 *
 * These are what turn the product promise into something a test can fail on.
 * Run them over the golden fixture and the 37 verified employees become a
 * conformance suite for citations, translations and dead ends, not just arithmetic.
 */

import { ALL_SOURCE_REFS, RULE_SOURCE, type SourceRef } from "./citation";
import { type DerivationGraph, nodeAt } from "./graph";
import { hasKey, LANGS } from "./i18n/render";
import { type DerivationNode, TERMINAL_KINDS } from "./node";

export class InvariantError extends Error {
  readonly nodeId?: string;

  constructor(message: string, nodeId?: string) {
    super(nodeId === undefined ? message : `${message} (node ${nodeId})`);
    this.name = "InvariantError";
    this.nodeId = nodeId;
  }
}

/**
 * Every node either has an input edge, or is one of the four kinds permitted to
 * be terminal — and each of those explains itself with provenance or a citation.
 * This is the invariant the old prose trace could not express: a bare zero from a
 * failed band lookup was indistinguishable from a zero owed to statute.
 */
export function assertNoDeadEnds(graph: DerivationGraph): void {
  for (const id of graph.order) {
    const node = nodeAt(graph, id);
    if (node.inputs.length > 0) {
      continue;
    }
    /**
     * An aggregate over nothing is a legitimate zero — no other deductions were
     * recorded — and what explains it is structural, not statutory. Rather than
     * attach a stretched citation, require it to say so and to actually be zero.
     */
    if (node.kind === "AGGREGATE") {
      if (node.detail === undefined) {
        throw new InvariantError(
          "empty AGGREGATE must say that nothing was included",
          id
        );
      }
      if (node.value.t !== "SEN" || node.value.sen !== 0) {
        throw new InvariantError("empty AGGREGATE must be zero", id);
      }
      continue;
    }
    if (!TERMINAL_KINDS.includes(node.kind)) {
      throw new InvariantError(
        `${node.kind} has no inputs and is not a terminal kind`,
        id
      );
    }
    if (
      (node.kind === "SETTING" ||
        node.kind === "NOT_APPLICABLE" ||
        node.kind === "EXTERNAL_VERIFIED") &&
      node.citations.length === 0
    ) {
      throw new InvariantError(`${node.kind} must carry a citation`, id);
    }
    if (node.kind === "INPUT" && node.fieldPath.length === 0) {
      throw new InvariantError("INPUT must name the field it came from", id);
    }
  }
}

/**
 * Rounding cannot be skipped or hidden: an unrounded value may only be consumed
 * by a ROUNDING node, and may never reach a root. Without this, `money.ts`'s
 * fused multiply-and-round would leave rounding invisible in the explanation.
 */
export function assertRoundingDiscipline(graph: DerivationGraph): void {
  for (const id of graph.order) {
    const node = nodeAt(graph, id);
    for (const ref of node.inputs) {
      const source = nodeAt(graph, ref.nodeId);
      if (source.value.t === "EXACT_SEN" && node.kind !== "ROUNDING") {
        throw new InvariantError(
          `${node.kind} consumes the unrounded value of ${ref.nodeId}; only ROUNDING may`,
          id
        );
      }
    }
  }
  for (const [key, rootId] of Object.entries(graph.roots)) {
    if (rootId === undefined) {
      continue;
    }
    if (nodeAt(graph, rootId).value.t === "EXACT_SEN") {
      throw new InvariantError(`root ${key} is an unrounded value`, rootId);
    }
  }
}

/** Every edge is resolvable, and every exclusion says why. */
export function assertEdgesResolve(graph: DerivationGraph): void {
  const seen = new Set<string>();
  for (const id of graph.order) {
    const node = nodeAt(graph, id);
    for (const ref of node.inputs) {
      if (graph.nodes[ref.nodeId] === undefined) {
        throw new InvariantError(
          `edge points at missing node ${ref.nodeId}`,
          id
        );
      }
      if (ref.role === "EXCLUDED" && ref.because === undefined) {
        throw new InvariantError(
          `excluded input ${ref.nodeId} does not say why`,
          id
        );
      }
    }
    if (seen.has(id)) {
      throw new InvariantError("id appears twice in the emit order", id);
    }
    seen.add(id);
  }
  if (seen.size !== Object.keys(graph.nodes).length) {
    throw new InvariantError("emit order does not cover every node");
  }
}

/**
 * A calculation's operands are a second way of naming the nodes it consumes, and
 * only `inputs` is walked by the builder, the acyclicity check, the rounding
 * discipline check and the drill-down. An operand with no matching input edge is
 * therefore a term that appears in the arithmetic but is invisible to every
 * check that makes the graph trustworthy.
 */
export function assertOperandsAreEdges(graph: DerivationGraph): void {
  for (const id of graph.order) {
    const node = nodeAt(graph, id);
    if (node.kind !== "CALCULATION") {
      continue;
    }
    const edges = new Set(node.inputs.map((ref) => ref.nodeId));
    for (const operand of node.operands) {
      if (operand.o === "REF" && !edges.has(operand.nodeId)) {
        throw new InvariantError(
          `operand ${operand.nodeId} is not among the node's input edges`,
          id
        );
      }
    }
  }
}

/**
 * Acyclicity, proved from the emit order: every input must appear before the node
 * that consumes it. The builder enforces this on the way in; this re-checks a
 * graph that came back from storage.
 */
export function assertAcyclic(graph: DerivationGraph): void {
  const position = new Map<string, number>();
  graph.order.forEach((id, i) => {
    position.set(id, i);
  });
  for (const [i, id] of graph.order.entries()) {
    for (const ref of nodeAt(graph, id).inputs) {
      const at = position.get(ref.nodeId);
      if (at === undefined || at >= i) {
        throw new InvariantError(
          `input ${ref.nodeId} does not precede its consumer`,
          id
        );
      }
    }
  }
}

/** Every citation names a source the rule pack actually publishes. */
export function assertCitationsResolve(
  graph: DerivationGraph,
  knownRefs: readonly SourceRef[] = ALL_SOURCE_REFS
): void {
  for (const id of graph.order) {
    const node = nodeAt(graph, id);
    for (const c of node.citations) {
      if (!knownRefs.includes(c.sourceRef)) {
        throw new InvariantError(
          `citation names unknown source ${c.sourceRef}`,
          id
        );
      }
      /**
       * The rule and the document must actually belong together. Without this,
       * the shape alone permits an EPF rule citing the LHDN source — a citation
       * that looks authoritative and proves nothing.
       */
      const expected = RULE_SOURCE[c.ruleId];
      if (expected !== c.sourceRef) {
        throw new InvariantError(
          `${c.ruleId} is proved by ${expected}, but the citation names ${c.sourceRef}`,
          id
        );
      }
      if (c.rulePackId !== graph.rulePackId) {
        throw new InvariantError(
          `citation belongs to rule pack ${c.rulePackId}, graph is ${graph.rulePackId}`,
          id
        );
      }
    }
  }
}

/** Every message key the graph references exists in every language. */
export function assertKeysTranslated(graph: DerivationGraph): void {
  for (const id of graph.order) {
    const node = nodeAt(graph, id);
    for (const label of labelsOf(node)) {
      for (const lang of LANGS) {
        if (!hasKey(label, lang)) {
          throw new InvariantError(
            `message key "${label}" is missing from ${lang}`,
            id
          );
        }
      }
    }
  }
}

function labelsOf(node: DerivationNode): string[] {
  const keys: string[] = [node.label.key];
  if (node.detail) {
    keys.push(node.detail.key);
  }
  for (const ref of node.inputs) {
    if (ref.because) {
      keys.push(ref.because.key);
    }
  }
  // A clause may carry only a locator: "row 236" needs no heading above it.
  for (const c of node.citations) {
    if (c.clause?.label) {
      keys.push(c.clause.label.key);
    }
  }
  return keys;
}

/** Everything, in the order that gives the most useful failure first. */
export function assertGraphInvariants(graph: DerivationGraph): void {
  assertEdgesResolve(graph);
  assertAcyclic(graph);
  assertOperandsAreEdges(graph);
  assertNoDeadEnds(graph);
  assertRoundingDiscipline(graph);
  assertCitationsResolve(graph);
  assertKeysTranslated(graph);
}
