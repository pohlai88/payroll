import { describe, expect, it } from "vitest";
import { diffGraphs } from "@/domain/derive/diff";
import {
  type DerivationGraph,
  GraphBuilder,
  ROOT_KEYS,
} from "@/domain/derive/graph";
import { assertOperandsAreEdges } from "@/domain/derive/invariants";
import type { DerivationNode } from "@/domain/derive/node";
import { exactSen, pctFromNumber, sen } from "@/domain/derive/value";

function inputNode(
  id: string,
  value: number
): Parameters<GraphBuilder["add"]>[0] {
  return {
    kind: "INPUT",
    id,
    label: { key: "input.baseRate" },
    value: sen(value),
    inputs: [],
    citations: [],
    origin: "LINE_ENTRY",
    fieldPath: id,
  };
}

describe("assertOperandsAreEdges", () => {
  it("rejects a calculation whose operand is not also an input edge", () => {
    const g = new GraphBuilder("MY-STATUTORY-2026-06");
    g.add(inputNode("a", 100));
    g.add(inputNode("b", 200));
    g.add({
      kind: "CALCULATION",
      id: "sum",
      op: "ADD",
      label: { key: "op.sum" },
      value: sen(300),
      // "b" drives the arithmetic but never appears as an edge, so the drill-down,
      // the acyclicity check and the rounding check would all miss it.
      operands: [
        { o: "REF", nodeId: "a" },
        { o: "REF", nodeId: "b" },
      ],
      inputs: [{ nodeId: "a", role: "TERM" }],
      citations: [],
    });
    expect(() => assertOperandsAreEdges(g.build())).toThrow(
      /operand b is not among/
    );
  });

  it("accepts literal operands, which name no node", () => {
    const g = new GraphBuilder("MY-STATUTORY-2026-06");
    g.add(inputNode("a", 100));
    g.add({
      kind: "CALCULATION",
      id: "doubled",
      op: "MUL",
      label: { key: "op.sum" },
      value: sen(200),
      operands: [
        { o: "REF", nodeId: "a" },
        { o: "LITERAL", value: { t: "COUNT", value: 2, unit: "ITEM" } },
      ],
      inputs: [{ nodeId: "a", role: "TERM" }],
      citations: [],
    });
    expect(() => assertOperandsAreEdges(g.build())).not.toThrow();
  });
});

describe("value constructors hold the line money.ts holds", () => {
  it("refuses a fractional or unsafe sen figure", () => {
    expect(() => sen(100.5)).toThrow(RangeError);
    expect(() => sen(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
    expect(sen(0)).toEqual({ t: "SEN", sen: 0 });
  });

  it("refuses an exact rational that cannot be rendered", () => {
    // den === 0 renders as Infinity and still satisfies the rounding invariant.
    expect(() => exactSen({ num: 1, den: 0 }, 1)).toThrow(RangeError);
    expect(() => exactSen({ num: 1, den: -2 }, 1)).toThrow(RangeError);
    expect(() => exactSen({ num: 1, den: 2 }, 0.5)).toThrow(RangeError);
    expect(() => exactSen({ num: 1, den: 2 }, 1)).not.toThrow();
  });

  it("refuses a rate carrying more precision than it can store", () => {
    expect(pctFromNumber(6.5)).toEqual({ t: "RATE_PCT", pctX100: 650 });
    expect(pctFromNumber(11)).toEqual({ t: "RATE_PCT", pctX100: 1100 });
    // 11.234% would be stored as 11.23% while the engine still computes with
    // 11.234 — the graph would explain a figure it did not produce.
    expect(() => pctFromNumber(11.234)).toThrow(RangeError);
  });
});

describe("ROOT_KEYS", () => {
  it("has no duplicates and covers every mirrored root exactly once", () => {
    expect(new Set(ROOT_KEYS).size).toBe(ROOT_KEYS.length);
  });
});

describe("diffGraphs ignores key order", () => {
  const node = (value: DerivationNode["value"]): DerivationNode => ({
    kind: "INPUT",
    id: "n",
    label: { key: "input.baseRate" },
    value,
    inputs: [],
    citations: [],
    origin: "LINE_ENTRY",
    fieldPath: "n",
  });

  const graphOf = (value: DerivationNode["value"]): DerivationGraph => ({
    schemaVersion: 1,
    rulePackId: "MY-STATUTORY-2026-06",
    nodes: { n: node(value) },
    order: ["n"],
    roots: {},
  });

  it("reports no change when a rehydrated graph carries the same data in another order", () => {
    // What a storage round-trip can do: same rational, keys the other way round.
    const emitted = graphOf({
      t: "EXACT_SEN",
      exact: { num: 3, den: 2 },
      approxSen: 2,
    });
    const rehydrated = graphOf({
      approxSen: 2,
      exact: { den: 2, num: 3 },
      t: "EXACT_SEN",
    } as DerivationNode["value"]);
    expect(diffGraphs(emitted, rehydrated)).toEqual([]);
  });

  it("still reports a real change in the value", () => {
    const before = graphOf({ t: "SEN", sen: 100 });
    const after = graphOf({ t: "SEN", sen: 150 });
    expect(diffGraphs(before, after)).toMatchObject([
      { d: "VALUE", id: "n", deltaSen: 50 },
    ]);
  });
});
