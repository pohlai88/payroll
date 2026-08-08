/**
 * The eleven kinds of derivation node.
 *
 * The governing invariant of the whole system: exactly five kinds may be
 * terminal — INPUT, SETTING, TABLE_LOOKUP, EXTERNAL_VERIFIED and NOT_APPLICABLE —
 * and each of those answers "why?" with either provenance (who entered it, when)
 * or a citation (issuer, URL, SHA-256). Every other kind must have at least one
 * input edge. `assertNoDeadEnds` enforces it, so "nothing is hidden" is a failing
 * test rather than a slogan.
 */

import type { Citation } from "./citation";
import type { MessageKey } from "./i18n/en";
import type { LabelRef } from "./label";
import type { NodeValue, TableRow } from "./value";

export type NodeId = string;

export type Label = LabelRef<MessageKey>;

export type NodeFlag =
  /** EIS first-time contribution history at age 57 is unknown. */
  | "REVIEW_REQUIRED"
  /** PCB entered but not yet verified against its source. */
  | "UNVERIFIED"
  /** PCB absent — blocks net pay. */
  | "NOT_ENTERED"
  /** Rounding changed nothing, or a full month needed no proration. */
  | "NO_OP";

/** An edge into a node. `because` is required when the role is EXCLUDED. */
export interface Ref {
  readonly nodeId: NodeId;
  readonly role: string;
  readonly because?: Label;
}

interface NodeBase {
  readonly id: NodeId;
  readonly label: Label;
  readonly value: NodeValue;
  readonly inputs: readonly Ref[];
  readonly citations: readonly Citation[];
  readonly flags?: readonly NodeFlag[];
  /** One line of explanation. Still a key plus params, never prose. */
  readonly detail?: Label;
}

/** Something a person or an import put into the system. Terminal, but attributable. */
export interface InputNode extends NodeBase {
  readonly kind: "INPUT";
  readonly inputs: readonly [];
  readonly citations: readonly [];
  readonly origin:
    | "EMPLOYEE_MASTER"
    | "LINE_ENTRY"
    | "PERIOD"
    | "IMPORT"
    | "COMPANY";
  readonly fieldPath: string;
  readonly provenance?: {
    readonly enteredBy?: string;
    readonly enteredAt?: string;
    readonly importBatchId?: string;
  };
}

/**
 * A scalar from the rule pack. Separate from INPUT because nobody at the company
 * typed it — it comes from KWSP or PERKESO and carries its own citation. Folding
 * these into INPUT would make a statutory rate change look like a data entry change.
 */
export interface SettingNode extends NodeBase {
  readonly kind: "SETTING";
  readonly inputs: readonly [];
  readonly settingKey: string;
  /** Verbatim from the rule pack, before any numeric coercion. */
  readonly rawValue: string;
  readonly citations: readonly [Citation, ...Citation[]];
}

/** A non-money decision: age, EPF part, SOCSO category, EIS eligibility. */
export interface ClassificationNode extends NodeBase {
  readonly kind: "CLASSIFICATION";
  readonly subject:
    | "AGE"
    | "EPF_PART"
    | "SOCSO_CATEGORY"
    | "EIS_ELIGIBILITY"
    | "SKBBK_WINDOW";
  /** True when a human set this on the employee record rather than deriving it. */
  readonly manual?: boolean;
}

/**
 * One row of a statutory band table.
 *
 * The value is the whole row, emitted once per (table, wage) and shared by the
 * employee and employer nodes — so one lookup highlights the schedule once, not
 * twice. The full table is deliberately not stored: `tableId` plus `rowIndex` is
 * enough for the UI to fetch it once and highlight, which is the difference
 * between 800 bytes and 33 kilobytes per node.
 */
export interface TableLookupNode extends NodeBase {
  readonly kind: "TABLE_LOOKUP";
  readonly value: { readonly t: "ROW"; readonly row: TableRow };
  readonly tableId:
    | "EPF_3RD_SCH_A"
    | "EPF_3RD_SCH_C"
    | "EPF_3RD_SCH_E"
    | "SOCSO_ACT4_SKBBK"
    | "EIS_ACT800";
  readonly rowIndex: number;
  readonly rowCount: number;
  /** The wage that was searched for, and the node that produced it. */
  readonly keySen: number;
  /** Neighbouring rows, so the UI can show how close the wage is to the next band. */
  readonly neighbours: { readonly prev?: TableRow; readonly next?: TableRow };
  /** The wage searched for, then the classification that chose this table. */
  readonly inputs: readonly [Ref, ...Ref[]];
  readonly citations: readonly [Citation, ...Citation[]];
}

export type CalcOp =
  | "ADD"
  | "SUB"
  | "MUL"
  | "DIV"
  | "MUL_DIV"
  | "PCT"
  | "MAX"
  | "MIN"
  | "NEGATE"
  | "COLUMN_SELECT";

export type Operand =
  | { readonly o: "REF"; readonly nodeId: NodeId }
  | { readonly o: "LITERAL"; readonly value: NodeValue };

export interface CalculationNode extends NodeBase {
  readonly kind: "CALCULATION";
  readonly op: CalcOp;
  readonly operands: readonly Operand[];
  /** Which column was taken, when op is COLUMN_SELECT. */
  readonly column?: string;
}

/**
 * Rounding, made visible.
 *
 * `money.ts` fuses multiply-and-round, so without a node owning this step the
 * exact pre-rounded value has no home and the rounding disappears. CEIL_RINGGIT
 * carries a citation because rounding up to the whole ringgit is a KWSP rule;
 * HALF_UP_SEN carries none, because it is a numeric convention and pretending
 * otherwise would be inventing a source.
 */
export interface RoundingNode extends NodeBase {
  readonly kind: "ROUNDING";
  readonly mode: "HALF_UP_SEN" | "CEIL_RINGGIT";
  readonly value: { readonly t: "SEN"; readonly sen: number };
  readonly deltaSen: number;
  readonly inputs: readonly [Ref];
}

/**
 * Kept distinct from CALCULATION because it cites the Employment Act, because a
 * full month must read as "no proration applied" rather than as a multiply by
 * one, and because it is the most disputed figure in Malaysian payroll.
 */
export interface ProrationNode extends NodeBase {
  readonly kind: "PRORATION";
  readonly basis: "MONTHLY" | "DAILY" | "HOURLY";
  readonly numerator: number;
  readonly denominator: number;
  readonly citations: readonly [Citation, ...Citation[]];
}

/** PCB/MTD. Never computed — supplied, evidenced, and possibly unknown. */
export interface ExternalVerifiedNode extends NodeBase {
  readonly kind: "EXTERNAL_VERIFIED";
  readonly source: string | null;
  readonly verificationStatus: "VERIFIED" | "UNVERIFIED" | "NOT_ENTERED";
  readonly evidenceRef?: string;
  readonly inputs: readonly [];
  readonly citations: readonly [Citation, ...Citation[]];
}

/** Keeps the computed node in the graph as an input, so the drill shows both sides. */
export interface ManualOverrideNode extends NodeBase {
  readonly kind: "MANUAL_OVERRIDE";
  readonly field: string;
  readonly computedSen: number;
  readonly overrideSen: number;
  readonly reason: string;
  readonly evidenceRef?: string;
  readonly approvedBy?: string;
  readonly inputs: readonly [Ref];
}

/**
 * A sum whose members carry their role. Excluded members are the point: without
 * them, "why isn't my overtime in EPF wages?" has no answer anywhere in the system.
 */
export interface AggregateNode extends NodeBase {
  readonly kind: "AGGREGATE";
  readonly inputs: readonly Ref[];
}

/**
 * A zero that explains itself. Replaces the bare `{ eeSen: 0, erSen: 0 }` returns
 * that made "contributes nothing by law" indistinguishable from "the lookup failed".
 */
export interface NotApplicableNode extends NodeBase {
  readonly kind: "NOT_APPLICABLE";
  readonly value: { readonly t: "SEN"; readonly sen: 0 };
  /** Usually the classification that ruled the contribution out, so the drill continues. */
  readonly inputs: readonly Ref[];
  readonly citations: readonly [Citation, ...Citation[]];
}

export type DerivationNode =
  | InputNode
  | SettingNode
  | ClassificationNode
  | TableLookupNode
  | CalculationNode
  | RoundingNode
  | ProrationNode
  | ExternalVerifiedNode
  | ManualOverrideNode
  | AggregateNode
  | NotApplicableNode;

export type NodeKind = DerivationNode["kind"];

/**
 * The only kinds allowed to have no inputs.
 *
 * TABLE_LOOKUP is terminal in the sense that its value is read from a cited
 * document rather than computed — but it always carries one edge, the wage that
 * was searched for, so it is not listed here. Its type enforces that edge.
 */
export const TERMINAL_KINDS: readonly NodeKind[] = [
  "INPUT",
  "SETTING",
  "EXTERNAL_VERIFIED",
  "NOT_APPLICABLE",
];

/** Roles used on aggregate edges. EXCLUDED always carries a reason. */
export const ROLE_INCLUDED = "INCLUDED";
export const ROLE_EXCLUDED = "EXCLUDED";
