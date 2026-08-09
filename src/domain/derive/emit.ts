/**
 * Emits the derivation graph for one payroll line.
 *
 * This runs alongside `computeLine` rather than replacing its arithmetic: every
 * figure here comes from the same carried calculators and the same `money.ts`,
 * so the graph cannot drift from the numbers the golden master pins. What the
 * graph adds is the *why* — which band, which row of it, which document, which
 * rounding step, and which inputs were deliberately left out of a wage base.
 */

import { classify } from "../calc/classify";
import { eis } from "../calc/eis";
import { epf, findEpfBandIndex } from "../calc/epf";
import { enrichPcbForCompute, pcbNet } from "../calc/pcb";
import { regularPay } from "../calc/proration";
import { resolveItems } from "../calc/resolve-items";
import { socso } from "../calc/socso";
import type {
  Band5,
  EmployeeSnapshot,
  EpfPart,
  LineInputs,
  OverrideInput,
  PayItemDef,
  PcbInput,
  ResolvedLineItem,
  RuleSettings,
  SocsoBand,
  SocsoCategory,
  StatutoryTables,
} from "../calc/types";
import { roundHalfUpSen } from "../money";
import type { Citation, RuleId, SourceRef } from "./citation";
import { type DerivationGraph, GraphBuilder, type RootKey } from "./graph";
import type { MessageKey } from "./i18n/en";
import { type LabelRef, p } from "./label";
import {
  explainMulDiv,
  explainMulHalfUp,
  explainPctCeilRinggit,
  explainPctHalfUp,
} from "./money-explain";
import {
  type Label,
  type NodeFlag,
  type NodeId,
  type Operand,
  type Ref,
  ROLE_EXCLUDED,
  ROLE_INCLUDED,
} from "./node";
import {
  bool,
  count,
  date,
  enumValue,
  exactSen,
  type NodeValue,
  pctFromNumber,
  sen,
  senUnknown,
  type TableRow,
} from "./value";

/** Overrides carry their justification into the graph; the plain engine only needs the amount. */
export interface DeriveOverrideInput extends OverrideInput {
  readonly reason?: string;
  readonly evidenceRef?: string;
  readonly approvedBy?: string;
}

export interface DeriveOptions {
  readonly rulePackId: string;
  readonly employee: EmployeeSnapshot;
  readonly inputs: LineInputs;
  readonly payItems: PayItemDef[];
  readonly tables: StatutoryTables;
  readonly settings: RuleSettings;
  readonly overrides?: readonly DeriveOverrideInput[];
  readonly pcb?: PcbInput | null;
  readonly pcbSource?: string | null;
  readonly pcbEvidenceRef?: string;
  readonly hrdfLevyEnabled?: boolean;
  readonly hrdfLevyPct?: number;
}

const label = (key: MessageKey, params?: LabelRef["params"]): Label => ({
  key,
  params,
});

/**
 * Which Third Schedule table a banded contribution was read from. Only A, C and
 * E have schedules; anything else never reaches a band lookup, and E is the
 * long-standing fallback rather than a new choice made here.
 */
function epfScheduleId(part: EpfPart) {
  if (part === "A") {
    return "EPF_3RD_SCH_A" as const;
  }
  if (part === "C") {
    return "EPF_3RD_SCH_C" as const;
  }
  return "EPF_3RD_SCH_E" as const;
}

export function deriveLine(opts: DeriveOptions): DerivationGraph {
  const { employee, inputs, settings, tables, rulePackId } = opts;
  const g = new GraphBuilder(rulePackId);
  const matrix = new Map(opts.payItems.map((i) => [i.code, i]));
  const overrides = new Map((opts.overrides ?? []).map((o) => [o.field, o]));

  const cite = (
    sourceRef: SourceRef,
    ruleId: RuleId,
    locator?: string
  ): Citation => ({
    rulePackId,
    sourceRef,
    ruleId,
    ...(locator === undefined ? {} : { clause: { locator } }),
  });

  // ---------------------------------------------------------------- inputs --

  const input = (
    id: NodeId,
    lbl: Label,
    value: NodeValue,
    fieldPath: string,
    origin: "EMPLOYEE_MASTER" | "LINE_ENTRY" | "PERIOD" | "COMPANY"
  ): NodeId =>
    g.add({
      kind: "INPUT",
      id,
      label: lbl,
      value,
      inputs: [],
      citations: [],
      origin,
      fieldPath,
    });

  const periodEndId = input(
    "line.input.periodEnd",
    label("input.periodEnd"),
    date(inputs.periodEnd),
    "inputs.periodEnd",
    "PERIOD"
  );

  const { dob } = employee;
  const dobId =
    dob === null
      ? null
      : input(
          "line.input.dob",
          label("input.dob"),
          date(dob),
          "employee.dob",
          "EMPLOYEE_MASTER"
        );

  const baseRateId = input(
    "line.input.baseRate",
    label("input.baseRate"),
    sen(employee.baseRateSen),
    "employee.baseRateSen",
    "EMPLOYEE_MASTER"
  );

  const workingDaysId = input(
    "line.input.workingDays",
    label("input.workingDays"),
    count(inputs.workingDays, "DAY"),
    "inputs.workingDays",
    "PERIOD"
  );

  // -------------------------------------------------------- classification --

  const cls = classify(employee, inputs.periodEnd, settings);

  // A null age is not rendered as age 0 anywhere below: the classification
  // nodes carry statutory citations, so stating an age the record does not
  // support would attach a fabricated fact to a real rule reference.
  const age = cls.ageAtPeriodEnd;

  const ageId =
    age === null || dob === null || dobId === null
      ? null
      : g.add({
          kind: "CLASSIFICATION",
          id: "line.class.age",
          subject: "AGE",
          label: label("class.age"),
          value: count(age, "YEAR"),
          detail: label("class.age.detail", {
            dob: p.date(dob),
            age: p.int(age),
            periodEnd: p.date(inputs.periodEnd),
          }),
          inputs: [
            { nodeId: dobId, role: "DATE_OF_BIRTH" },
            { nodeId: periodEndId, role: "AS_AT" },
          ],
          citations: [],
        });

  const ageRefs: Ref[] = ageId === null ? [] : [{ nodeId: ageId, role: "AGE" }];

  // Each classification detail answers the same four questions in the same
  // order — overridden, not applicable, age unknown, or the real reason. Read
  // as a ternary chain the order was invisible; as early returns it is the rule.
  const epfPartDetail = (): Label => {
    const part = p.enum("EPF_PART", cls.epfPart);
    if (employee.epfPartOverride !== null) {
      return label("class.epfPart.override", { part });
    }
    if (!employee.epfApplicable) {
      return label("class.epfPart.notApplicable");
    }
    if (age === null) {
      return label("class.epfPart.noAge", { part });
    }
    return label("class.epfPart.detail", { part, age: p.int(age) });
  };

  const epfPartId = g.add({
    kind: "CLASSIFICATION",
    id: "line.class.epfPart",
    subject: "EPF_PART",
    label: label("class.epfPart"),
    value: enumValue("EPF_PART", cls.epfPart),
    manual: employee.epfPartOverride !== null,
    detail: epfPartDetail(),
    inputs:
      ageRefs.length > 0 ? ageRefs : [{ nodeId: periodEndId, role: "AS_AT" }],
    citations: [cite("S1", "MY.EPF.CLASSIFY.PART")],
  });

  const socsoCategoryDetail = (): Label => {
    const category = p.enum("SOCSO_CATEGORY", cls.socsoCategory);
    if (employee.socsoCategoryOverride !== null) {
      return label("class.socsoCategory.override", { category });
    }
    if (!employee.socsoApplicable) {
      return label("class.socsoCategory.notApplicable");
    }
    if (age === null) {
      return label("class.socsoCategory.noAge", { category });
    }
    return label("class.socsoCategory.detail", { category, age: p.int(age) });
  };

  const socsoCategoryId = g.add({
    kind: "CLASSIFICATION",
    id: "line.class.socsoCategory",
    subject: "SOCSO_CATEGORY",
    label: label("class.socsoCategory"),
    value: enumValue("SOCSO_CATEGORY", cls.socsoCategory),
    manual: employee.socsoCategoryOverride !== null,
    detail: socsoCategoryDetail(),
    inputs:
      ageRefs.length > 0 ? ageRefs : [{ nodeId: periodEndId, role: "AS_AT" }],
    citations: [cite("S2", "MY.SOCSO.CLASSIFY.CATEGORY")],
  });

  // The 57 review comes first: it is the one case where an eligible-looking age
  // still needs a human to confirm contribution history.
  const eisEligibleDetail = (): Label => {
    const min = p.int(settings.eisMinAge);
    const max = p.int(settings.eisMaxAgeExclusive);
    if (cls.eisAge57Review && age !== null) {
      return label("class.eisEligible.age57Review", { age: p.int(age) });
    }
    if (!employee.eisApplicable) {
      return label("class.eisEligible.notApplicable");
    }
    if (age === null) {
      return label("class.eisEligible.noAge", { min, max });
    }
    return label("class.eisEligible.detail", {
      eligibility: p.enum(
        "EIS_ELIGIBILITY",
        cls.eisEligible ? "ELIGIBLE" : "NOT_ELIGIBLE"
      ),
      age: p.int(age),
      min,
      max,
    });
  };

  const eisEligibleId = g.add({
    kind: "CLASSIFICATION",
    id: "line.class.eisEligibility",
    subject: "EIS_ELIGIBILITY",
    label: label("class.eisEligible"),
    value: bool(cls.eisEligible),
    detail: eisEligibleDetail(),
    inputs:
      ageRefs.length > 0 ? ageRefs : [{ nodeId: periodEndId, role: "AS_AT" }],
    citations: [
      cite("S3", "MY.EIS.CLASSIFY.ELIGIBILITY"),
      ...(cls.eisAge57Review
        ? [cite("S3", "MY.EIS.FIRST_TIME_REVIEW.HISTORY_UNKNOWN")]
        : []),
    ],
    ...(cls.eisAge57Review ? { flags: ["REVIEW_REQUIRED" as NodeFlag] } : {}),
  });

  // -------------------------------------------------------------- earnings --

  /** Basic pay. The proration step is always emitted, even for a full month. */
  const reg = regularPay(
    employee.payBasis,
    employee.baseRateSen,
    inputs.workingDays,
    inputs.paidDays,
    inputs.hoursWorked
  );

  const basicId = emitBasic();

  function emitBasic(): NodeId {
    if (employee.payBasis === "MONTHLY") {
      const paid = inputs.paidDays ?? inputs.workingDays;
      const paidDaysId = input(
        "line.input.paidDays",
        label("input.paidDays"),
        count(paid, "DAY"),
        "inputs.paidDays",
        "LINE_ENTRY"
      );
      const fullMonth = paid === inputs.workingDays;
      // Routed through money.ts rather than recomputing the quotient here, so the
      // unrounded value shown to the user is the one that actually got rounded.
      const r = explainMulDiv(employee.baseRateSen, paid, inputs.workingDays);
      if (r.sen !== reg.amountSen) {
        throw new Error(
          `derive: proration of ${employee.baseRateSen} sen over ${paid}/${inputs.workingDays} gives ${r.sen}, but regularPay produced ${reg.amountSen}`
        );
      }
      const { exact } = r;
      const prorationId = g.add({
        kind: "PRORATION",
        id: "line.earn.BASIC.proration",
        basis: "MONTHLY",
        numerator: paid,
        denominator: inputs.workingDays,
        label: label("proration.monthly"),
        value: exactSen(exact, reg.amountSen),
        detail: fullMonth
          ? label("proration.fullMonth", {
              paid: p.num(paid, 0),
              working: p.num(inputs.workingDays, 0),
            })
          : label("proration.monthly.detail", {
              basic: p.sen(employee.baseRateSen),
              paid: p.num(paid, 0),
              working: p.num(inputs.workingDays, 0),
            }),
        inputs: [
          { nodeId: baseRateId, role: "AMOUNT" },
          { nodeId: paidDaysId, role: "NUMERATOR" },
          { nodeId: workingDaysId, role: "DENOMINATOR" },
        ],
        citations: [cite("L1", "MY.EA1955.S18A.PRORATION", "s.18A")],
        ...(fullMonth ? { flags: ["NO_OP" as NodeFlag] } : {}),
      });
      return emitRounding(
        "line.earn.BASIC",
        label("earn.basic"),
        prorationId,
        exact,
        reg.amountSen,
        "HALF_UP_SEN"
      );
    }

    if (employee.payBasis === "DAILY") {
      const paid = inputs.paidDays ?? 0;
      const paidDaysId = input(
        "line.input.paidDays",
        label("input.paidDays"),
        count(paid, "DAY"),
        "inputs.paidDays",
        "LINE_ENTRY"
      );
      const exact = { num: employee.baseRateSen * paid, den: 1 };
      const calcId = g.add({
        kind: "PRORATION",
        id: "line.earn.BASIC.days",
        basis: "DAILY",
        numerator: paid,
        denominator: 1,
        label: label("proration.daily", {
          days: p.num(paid, 0),
          rate: p.sen(employee.baseRateSen),
        }),
        value: exactSen(exact, reg.amountSen),
        inputs: [
          { nodeId: baseRateId, role: "RATE" },
          { nodeId: paidDaysId, role: "QUANTITY" },
        ],
        citations: [cite("L1", "MY.EA1955.S18A.PRORATION")],
      });
      return emitRounding(
        "line.earn.BASIC",
        label("earn.basic"),
        calcId,
        exact,
        reg.amountSen,
        "HALF_UP_SEN"
      );
    }

    const hours = inputs.hoursWorked ?? 0;
    const hoursId = input(
      "line.input.hoursWorked",
      label("input.hoursWorked"),
      count(hours, "HOUR"),
      "inputs.hoursWorked",
      "LINE_ENTRY"
    );
    const exact = { num: employee.baseRateSen * hours, den: 1 };
    const calcId = g.add({
      kind: "PRORATION",
      id: "line.earn.BASIC.hours",
      basis: "HOURLY",
      numerator: hours,
      denominator: 1,
      label: label("proration.hourly", {
        hours: p.num(hours, 2),
        rate: p.sen(employee.baseRateSen),
      }),
      value: exactSen(exact, reg.amountSen),
      inputs: [
        { nodeId: baseRateId, role: "RATE" },
        { nodeId: hoursId, role: "QUANTITY" },
      ],
      citations: [cite("L1", "MY.EA1955.S18A.PRORATION")],
    });
    return emitRounding(
      "line.earn.BASIC",
      label("earn.basic"),
      calcId,
      exact,
      reg.amountSen,
      "HALF_UP_SEN"
    );
  }

  function emitRounding(
    id: NodeId,
    lbl: Label,
    sourceId: NodeId,
    exact: { num: number; den: number },
    settled: number,
    mode: "HALF_UP_SEN" | "CEIL_RINGGIT"
  ): NodeId {
    const delta = settled - exact.num / exact.den;
    const roundingDetail = (): Label => {
      const rounded = {
        exact: p.sen(Math.round(exact.num / exact.den)),
        result: p.sen(settled),
      };
      if (delta === 0) {
        return label("round.noChange");
      }
      if (mode === "CEIL_RINGGIT") {
        return label("round.ceilRinggit.detail", {
          ...rounded,
          delta: p.sen(Math.round(delta)),
        });
      }
      return label("round.halfUp.detail", rounded);
    };
    return g.add({
      kind: "ROUNDING",
      id,
      mode,
      label: lbl,
      value: { t: "SEN", sen: settled },
      deltaSen: delta,
      detail: roundingDetail(),
      inputs: [{ nodeId: sourceId, role: "UNROUNDED" }],
      citations:
        mode === "CEIL_RINGGIT"
          ? [cite("S1", "MY.EPF.ABOVE_CEILING.ROUND_UP")]
          : [],
      ...(delta === 0 ? { flags: ["NO_OP" as NodeFlag] } : {}),
    });
  }

  /** Every earning and deduction line, in the same order `computeLine` builds them. */
  const earningRefs: Array<{ id: NodeId; code: string; amountSen: number }> = [
    { id: basicId, code: "BASIC", amountSen: reg.amountSen },
  ];
  const deductionRefs: Array<{ id: NodeId; code: string; amountSen: number }> =
    [];

  /**
   * Overtime has no dedicated branch here any more: it is an entered `PER_HOUR`
   * item like any other quantity-based earning, and `emitItem` explains it as
   * the multiplication it actually is. Resolving through the same `resolveItems`
   * that `computeLine` uses is what keeps the graph's amounts identical to the
   * ones the golden master pins.
   */
  for (const item of resolveItems(inputs.items, matrix)) {
    const def = matrix.get(item.payItemCode);
    const isDeduction = def?.kind === "DEDUCTION";
    const id = emitItem(item);
    (isDeduction ? deductionRefs : earningRefs).push({
      id,
      code: item.payItemCode,
      amountSen: item.amountSen,
    });
  }

  /**
   * Quantity × rate is only claimed when it actually reproduces the stored
   * amount. Anything else would be an explanation that does not match the number
   * it explains, which is the exact failure this system exists to prevent.
   */
  function emitItem(item: ResolvedLineItem): NodeId {
    const base = `line.earn.${item.payItemCode}`;
    const { qty, rateSen: rate } = item;
    const derivable =
      qty !== null &&
      rate !== null &&
      roundHalfUpSen(qty * rate) === item.amountSen;

    if (!derivable) {
      return input(
        g.uniqueId(base),
        label("earn.item", { code: p.text(item.payItemCode) }),
        sen(item.amountSen),
        `items.${item.payItemCode}`,
        "LINE_ENTRY"
      );
    }

    const qtyId = input(
      g.uniqueId(`${base}.qty`),
      label("input.itemQty", { code: p.text(item.payItemCode) }),
      count(qty, "ITEM"),
      `items.${item.payItemCode}.qty`,
      "LINE_ENTRY"
    );
    const rateId = input(
      g.uniqueId(`${base}.rate`),
      label("input.itemRate", { code: p.text(item.payItemCode) }),
      sen(rate),
      `items.${item.payItemCode}.rateSen`,
      "LINE_ENTRY"
    );
    const r = explainMulHalfUp(rate, qty);
    const productId = g.add({
      kind: "CALCULATION",
      id: g.uniqueId(`${base}.product`),
      op: "MUL",
      label: label("earn.perUnit.detail", {
        days: p.num(qty, 0),
        rate: p.sen(rate),
      }),
      value: exactSen(r.exact, r.sen),
      operands: [
        { o: "REF", nodeId: rateId },
        { o: "REF", nodeId: qtyId },
      ],
      inputs: [
        { nodeId: rateId, role: "RATE" },
        { nodeId: qtyId, role: "QUANTITY" },
      ],
      citations: [],
    });
    return emitRounding(
      g.uniqueId(base),
      label("earn.item", { code: p.text(item.payItemCode) }),
      productId,
      r.exact,
      r.sen,
      "HALF_UP_SEN"
    );
  }

  // ----------------------------------------------------------------- gross --

  const grossSen = earningRefs.reduce((s, e) => s + e.amountSen, 0);
  const grossId = g.add({
    kind: "AGGREGATE",
    id: "line.gross",
    label: label("earn.gross"),
    value: sen(grossSen),
    detail: label("earn.gross.detail", { count: p.int(earningRefs.length) }),
    inputs: earningRefs.map((e) => ({ nodeId: e.id, role: ROLE_INCLUDED })),
    citations: [cite("L2", "MY.EA1955.REG9.WAGE_STATEMENT")],
  });
  g.root("gross", grossId);

  // ----------------------------------------------------------- wage bases --

  /**
   * Excluded members are carried as edges with a reason. Without them the
   * question "why isn't my overtime in EPF wages?" has no answer anywhere.
   */
  function emitWageBase(
    id: NodeId,
    lbl: Label,
    pick: (d: PayItemDef) => boolean,
    rootKey: RootKey,
    citation: Citation
  ): { id: NodeId; amountSen: number } {
    const refs: Ref[] = [];
    let total = 0;
    for (const e of earningRefs) {
      const def = matrix.get(e.code);
      const included = def !== undefined && def.kind === "EARNING" && pick(def);
      if (included) {
        total += e.amountSen;
        refs.push({ nodeId: e.id, role: ROLE_INCLUDED });
      } else {
        refs.push({
          nodeId: e.id,
          role: ROLE_EXCLUDED,
          because: label("wages.excluded.byMatrix", { code: p.text(e.code) }),
        });
      }
    }
    const computedId = g.add({
      kind: "AGGREGATE",
      id,
      label: lbl,
      value: sen(total),
      inputs: refs,
      citations: [citation, cite("S1", "MY.WAGES.PAY_ITEM_MATRIX")],
    });
    const finalId = applyOverride(
      rootKeyToField(rootKey),
      computedId,
      total,
      id
    );
    const finalAmount =
      overrides.get(rootKeyToField(rootKey))?.overrideSen ?? total;
    g.root(rootKey, finalId);
    return { id: finalId, amountSen: finalAmount };
  }

  function rootKeyToField(key: RootKey): OverrideInput["field"] {
    switch (key) {
      case "epfWages":
        return "EPF_WAGES";
      case "socsoWages":
        return "SOCSO_WAGES";
      case "eisWages":
        return "EIS_WAGES";
      case "epfEe":
        return "EPF_EE";
      case "epfEr":
        return "EPF_ER";
      case "socsoEeCore":
        return "SOCSO_EE_CORE";
      case "socsoEeSkbbk":
        return "SOCSO_EE_SKBBK";
      case "socsoEr":
        return "SOCSO_ER";
      case "eisEe":
        return "EIS_EE";
      case "eisEr":
        return "EIS_ER";
      default:
        throw new Error(`root ${key} is not overridable`);
    }
  }

  /** Keeps the computed node in the graph as an input, so the drill shows both sides. */
  function applyOverride(
    field: OverrideInput["field"],
    computedId: NodeId,
    computedSen: number,
    baseId: NodeId
  ): NodeId {
    const o = overrides.get(field);
    if (o === undefined) {
      return computedId;
    }
    return g.add({
      kind: "MANUAL_OVERRIDE",
      id: `${baseId}.override`,
      field,
      computedSen,
      overrideSen: o.overrideSen,
      reason: o.reason ?? "",
      ...(o.evidenceRef === undefined ? {} : { evidenceRef: o.evidenceRef }),
      ...(o.approvedBy === undefined ? {} : { approvedBy: o.approvedBy }),
      label: label("override.applied"),
      value: sen(o.overrideSen),
      detail: label("override.detail", {
        computed: p.sen(computedSen),
        override: p.sen(o.overrideSen),
        reason: p.text(o.reason ?? ""),
      }),
      inputs: [{ nodeId: computedId, role: "COMPUTED" }],
      citations: [],
    });
  }

  const epfWages = emitWageBase(
    "line.wages.epf",
    label("wages.epf"),
    (d) => d.epfWages,
    "epfWages",
    cite("S1", "MY.EPF.THIRD_SCHEDULE.BAND")
  );
  const socsoWages = emitWageBase(
    "line.wages.socso",
    label("wages.socso"),
    (d) => d.socsoWages,
    "socsoWages",
    cite("S2", "MY.SOCSO.ACT4.BAND")
  );
  const eisWages = emitWageBase(
    "line.wages.eis",
    label("wages.eis"),
    (d) => d.eisWages,
    "eisWages",
    cite("S3", "MY.EIS.ACT800.BAND")
  );

  // ------------------------------------------------------------------- EPF --

  const epfRes = epf(epfWages.amountSen, cls.epfPart, tables.epf, settings);
  emitEpf();

  /**
   * A zero that explains itself, and keeps explaining: where a classification
   * ruled the contribution out, it becomes an input so the drill continues down
   * to the age that caused it rather than stopping at "not applicable".
   */
  function notApplicable(
    id: NodeId,
    lbl: Label,
    why: Label,
    citation: Citation,
    becauseOf?: NodeId
  ): NodeId {
    return g.add({
      kind: "NOT_APPLICABLE",
      id,
      label: lbl,
      value: { t: "SEN", sen: 0 },
      detail: why,
      inputs:
        becauseOf === undefined
          ? []
          : [{ nodeId: becauseOf, role: "RULED_OUT_BY" }],
      citations: [citation],
    });
  }

  function bandRow(b: Band5): TableRow {
    return {
      fromSen: b.fromSen,
      toSen: b.toSen,
      columns: { eeSen: b.eeSen, erSen: b.erSen },
    };
  }

  function emitEpf(): void {
    const naReason = (): Label =>
      cls.epfPart === "NONE" ? label("epf.na.part") : label("epf.na.noWages");

    if (cls.epfPart === "NONE" || epfWages.amountSen <= 0) {
      const becauseOf = cls.epfPart === "NONE" ? epfPartId : epfWages.id;
      const ee = notApplicable(
        "line.epf.ee",
        label("epf.ee"),
        naReason(),
        cite("S1", "MY.EPF.NOT_APPLICABLE"),
        becauseOf
      );
      const er = notApplicable(
        "line.epf.er",
        label("epf.er"),
        naReason(),
        cite("S1", "MY.EPF.NOT_APPLICABLE"),
        becauseOf
      );
      g.root("epfEe", applyOverride("EPF_EE", ee, 0, "line.epf.ee"));
      g.root("epfEr", applyOverride("EPF_ER", er, 0, "line.epf.er"));
      return;
    }

    if (cls.epfPart === "F") {
      const eeId = emitPctCeil(
        "line.epf.ee",
        label("epf.ee"),
        epfWages,
        {
          pct: settings.epfPartFEePct,
          settingKey: "epf.partF.ee_pct",
          label: label("setting.epf.partFEePct"),
        },
        epfRes.eeSen,
        label("epf.partF.detail", { pct: p.pctOf(settings.epfPartFEePct) }),
        "MY.EPF.PART_F.FLAT_PCT"
      );
      const erId = emitPctCeil(
        "line.epf.er",
        label("epf.er"),
        epfWages,
        {
          pct: settings.epfPartFErPct,
          settingKey: "epf.partF.er_pct",
          label: label("setting.epf.partFErPct"),
        },
        epfRes.erSen,
        label("epf.partF.detail", { pct: p.pctOf(settings.epfPartFErPct) }),
        "MY.EPF.PART_F.FLAT_PCT"
      );
      g.root(
        "epfEe",
        applyOverride("EPF_EE", eeId, epfRes.eeSen, "line.epf.ee")
      );
      g.root(
        "epfEr",
        applyOverride("EPF_ER", erId, epfRes.erSen, "line.epf.er")
      );
      return;
    }

    if (epfWages.amountSen <= settings.epfTableCeilingSen) {
      const table = tables.epf[cls.epfPart as "A" | "C" | "E"];
      const index = findEpfBandIndex(table, epfWages.amountSen);
      const band = index < 0 ? undefined : table[index];
      // `epf()` searched the same table under the same predicate and would have
      // thrown on a gap, so reaching here without a row means the two searches
      // disagree — a bug in one of them, not a zero-contribution employee.
      if (band === undefined) {
        throw new Error(
          `derive: no EPF Part ${cls.epfPart} band for ${epfWages.amountSen} sen, but epf() found one`
        );
      }

      const tableId = epfScheduleId(cls.epfPart);

      const prev = index > 0 ? table[index - 1] : undefined;
      const next = index + 1 < table.length ? table[index + 1] : undefined;

      const bandId = g.add({
        kind: "TABLE_LOOKUP",
        id: "line.epf.band",
        tableId,
        rowIndex: index,
        rowCount: table.length,
        keySen: epfWages.amountSen,
        neighbours: {
          ...(prev === undefined ? {} : { prev: bandRow(prev) }),
          ...(next === undefined ? {} : { next: bandRow(next) }),
        },
        label: label("epf.band", { part: p.enum("EPF_PART", cls.epfPart) }),
        value: { t: "ROW", row: bandRow(band) },
        detail: label("epf.band.matched", {
          wages: p.sen(epfWages.amountSen),
          from: p.sen(band.fromSen),
          to: p.sen(band.toSen),
          row: p.int(index + 1),
          rows: p.int(table.length),
        }),
        inputs: [
          { nodeId: epfWages.id, role: "KEY" },
          { nodeId: epfPartId, role: "SELECTS_TABLE" },
        ],
        citations: [
          cite("S1", "MY.EPF.THIRD_SCHEDULE.BAND", `row ${index + 1}`),
        ],
      });

      const eeId = emitColumn(
        "line.epf.ee",
        label("epf.ee"),
        bandId,
        "eeSen",
        band.eeSen,
        label("epf.column"),
        cls.epfPart === "E"
          ? cite("S1", "MY.EPF.PART_E.EE_ZERO")
          : cite("S1", "MY.EPF.THIRD_SCHEDULE.BAND")
      );
      const erId = emitColumn(
        "line.epf.er",
        label("epf.er"),
        bandId,
        "erSen",
        band.erSen,
        label("epf.columnEr"),
        cite("S1", "MY.EPF.THIRD_SCHEDULE.BAND")
      );
      g.root("epfEe", applyOverride("EPF_EE", eeId, band.eeSen, "line.epf.ee"));
      g.root("epfEr", applyOverride("EPF_ER", erId, band.erSen, "line.epf.er"));
      return;
    }

    // Above the schedule ceiling: statutory percentages, rounded up to the ringgit.
    // Each rate is paired with the rule-pack key it came from, so the drill can
    // answer "where does this percentage come from?" with the setting itself.
    interface AboveCeilingRate {
      pct: number;
      settingKey: string;
      label: Label;
    }

    const eeRate = ((): AboveCeilingRate => {
      const lbl = label("setting.epf.aboveEePct");
      if (cls.epfPart === "C") {
        return {
          pct: settings.epfPartCAboveEePct,
          settingKey: "epf.partC.above.ee_pct",
          label: lbl,
        };
      }
      if (cls.epfPart === "E") {
        return {
          pct: settings.epfPartEAboveEePct,
          settingKey: "epf.partE.above.ee_pct",
          label: lbl,
        };
      }
      return {
        pct: settings.epfAboveEePct,
        settingKey: "epf.above.ee_pct",
        label: lbl,
      };
    })();

    // Employer side has one branch the employee side does not: outside Parts C
    // and E the rate steps down once wages pass the employer threshold.
    const erRate = ((): AboveCeilingRate => {
      const lbl = label("setting.epf.aboveErPct");
      if (cls.epfPart === "C") {
        return {
          pct: settings.epfPartCAboveErPct,
          settingKey: "epf.partC.above.er_pct",
          label: lbl,
        };
      }
      if (cls.epfPart === "E") {
        return {
          pct: settings.epfPartEAboveErPct,
          settingKey: "epf.partE.above.er_pct",
          label: lbl,
        };
      }
      if (epfWages.amountSen <= settings.epfErThresholdSen) {
        return {
          pct: settings.epfAboveErPctLeThreshold,
          settingKey: "epf.above.er_pct_le_threshold",
          label: lbl,
        };
      }
      return {
        pct: settings.epfAboveErPctGtThreshold,
        settingKey: "epf.above.er_pct_gt_threshold",
        label: lbl,
      };
    })();
    const eePct = eeRate.pct;
    const erPct = erRate.pct;

    const eeId = emitPctCeil(
      "line.epf.ee",
      label("epf.above.ee"),
      epfWages,
      eeRate,
      epfRes.eeSen,
      label("epf.above.detail", {
        wages: p.sen(epfWages.amountSen),
        ceiling: p.sen(settings.epfTableCeilingSen),
        pct: p.pctOf(eePct),
      }),
      cls.epfPart === "E" ? "MY.EPF.PART_E.EE_ZERO" : "MY.EPF.ABOVE_CEILING.PCT"
    );
    const erId = emitPctCeil(
      "line.epf.er",
      label("epf.above.er"),
      epfWages,
      erRate,
      epfRes.erSen,
      label("epf.above.detail", {
        wages: p.sen(epfWages.amountSen),
        ceiling: p.sen(settings.epfTableCeilingSen),
        pct: p.pctOf(erPct),
      }),
      "MY.EPF.ABOVE_CEILING.PCT"
    );
    g.root("epfEe", applyOverride("EPF_EE", eeId, epfRes.eeSen, "line.epf.ee"));
    g.root("epfEr", applyOverride("EPF_ER", erId, epfRes.erSen, "line.epf.er"));
  }

  function emitColumn(
    id: NodeId,
    lbl: Label,
    bandId: NodeId,
    column: string,
    value: number,
    detail: Label,
    citation: Citation
  ): NodeId {
    return g.add({
      kind: "CALCULATION",
      id,
      op: "COLUMN_SELECT",
      column,
      label: lbl,
      value: sen(value),
      detail,
      operands: [{ o: "REF", nodeId: bandId } satisfies Operand],
      inputs: [{ nodeId: bandId, role: "ROW" }],
      citations: [citation],
    });
  }

  /**
   * A percentage of wages rounded up to the whole ringgit — the KWSP rule for
   * Part F and for wages above the schedule ceiling.
   *
   * `rate` names the rule-pack setting the percentage actually came from. It is
   * passed in rather than derived from the node id because a SETTING node is the
   * drill's answer to "where does 11% come from?", and a fabricated key answers
   * that question wrongly while looking authoritative.
   */
  function emitPctCeil(
    id: NodeId,
    lbl: Label,
    base: { id: NodeId; amountSen: number },
    rate: { pct: number; settingKey: string; label: Label },
    settled: number,
    detail: Label,
    ruleId: RuleId
  ): NodeId {
    const { pct } = rate;
    const r = explainPctCeilRinggit(base.amountSen, pct);
    // The graph must round to the same figure the calculator produced, or the
    // explanation would describe arithmetic that did not happen.
    if (r.sen !== settled) {
      throw new Error(
        `derive: ${id} rounds ${base.amountSen} sen at ${pct}% to ${r.sen}, but the engine produced ${settled}`
      );
    }
    const rateId = g.add({
      kind: "SETTING",
      id: `${id}.rate`,
      settingKey: rate.settingKey,
      rawValue: String(pct),
      label: rate.label,
      value: pctFromNumber(pct),
      inputs: [],
      citations: [cite("S1", ruleId)],
    });
    const productId = g.add({
      kind: "CALCULATION",
      id: `${id}.product`,
      op: "PCT",
      label: label("op.percent", {
        pct: p.pctOf(pct),
        base: p.sen(base.amountSen),
      }),
      value: exactSen(r.exact, r.sen),
      detail,
      operands: [
        { o: "REF", nodeId: base.id },
        { o: "REF", nodeId: rateId },
      ],
      inputs: [
        { nodeId: base.id, role: "BASE" },
        { nodeId: rateId, role: "RATE" },
      ],
      citations: [cite("S1", ruleId)],
    });
    return emitRounding(id, lbl, productId, r.exact, settled, "CEIL_RINGGIT");
  }

  // ----------------------------------------------------------------- SOCSO --

  const socsoRes = socso(
    socsoWages.amountSen,
    cls.socsoCategory,
    tables.socso,
    inputs.periodEnd,
    settings
  );
  emitSocso();

  function socsoRow(b: SocsoBand): TableRow {
    return {
      fromSen: b.fromSen,
      toSen: b.toSen,
      columns: {
        cat1ErSen: b.cat1ErSen,
        cat1EeCoreSen: b.cat1EeCoreSen,
        cat1EeSkbbkSen: b.cat1EeSkbbkSen,
        cat2ErSen: b.cat2ErSen,
        cat2EeSkbbkSen: b.cat2EeSkbbkSen,
      },
    };
  }

  function emitSocso(): void {
    const naReason = (): Label =>
      cls.socsoCategory === "NONE"
        ? label("socso.na.category")
        : label("socso.na.noWages");

    const emitAllNotApplicable = (): void => {
      const becauseOf =
        cls.socsoCategory === "NONE" ? socsoCategoryId : socsoWages.id;
      const mk = (id: NodeId, lbl: Label): NodeId =>
        notApplicable(
          id,
          lbl,
          naReason(),
          cite("S2", "MY.SOCSO.NOT_APPLICABLE"),
          becauseOf
        );
      const er = mk("line.socso.er", label("socso.er"));
      const core = mk("line.socso.eeCore", label("socso.eeCore"));
      const skbbk = mk("line.socso.eeSkbbk", label("socso.eeSkbbk"));
      g.root("socsoEr", applyOverride("SOCSO_ER", er, 0, "line.socso.er"));
      g.root(
        "socsoEeCore",
        applyOverride("SOCSO_EE_CORE", core, 0, "line.socso.eeCore")
      );
      g.root(
        "socsoEeSkbbk",
        applyOverride("SOCSO_EE_SKBBK", skbbk, 0, "line.socso.eeSkbbk")
      );
    };

    if (cls.socsoCategory === "NONE" || socsoWages.amountSen <= 0) {
      emitAllNotApplicable();
      return;
    }

    const index = tables.socso.findIndex(
      (b) =>
        socsoWages.amountSen >= b.fromSen && socsoWages.amountSen <= b.toSen
    );
    const band = index < 0 ? undefined : tables.socso[index];
    // `socso()` already searched this table and throws on a gap, so a miss here
    // means the two searches disagree rather than that no contribution is due.
    if (band === undefined) {
      throw new Error(
        `derive: no SOCSO band for ${socsoWages.amountSen} sen, but socso() found one`
      );
    }

    const prev = index > 0 ? tables.socso[index - 1] : undefined;
    const next =
      index + 1 < tables.socso.length ? tables.socso[index + 1] : undefined;

    const bandId = g.add({
      kind: "TABLE_LOOKUP",
      id: "line.socso.band",
      tableId: "SOCSO_ACT4_SKBBK",
      rowIndex: index,
      rowCount: tables.socso.length,
      keySen: socsoWages.amountSen,
      neighbours: {
        ...(prev === undefined ? {} : { prev: socsoRow(prev) }),
        ...(next === undefined ? {} : { next: socsoRow(next) }),
      },
      label: label("socso.band"),
      value: { t: "ROW", row: socsoRow(band) },
      detail: label("socso.band.matched", {
        wages: p.sen(socsoWages.amountSen),
        from: p.sen(band.fromSen),
        to: p.sen(band.toSen),
        row: p.int(index + 1),
        rows: p.int(tables.socso.length),
      }),
      inputs: [
        { nodeId: socsoWages.id, role: "KEY" },
        { nodeId: socsoCategoryId, role: "SELECTS_COLUMN" },
      ],
      citations: [cite("S2", "MY.SOCSO.ACT4.BAND", `row ${index + 1}`)],
    });

    const skbbkActive =
      inputs.periodEnd >= settings.skbbkPhaseFrom &&
      inputs.periodEnd <= settings.skbbkPhaseTo;
    const windowId = g.add({
      kind: "CLASSIFICATION",
      id: "line.socso.skbbkWindow",
      subject: "SKBBK_WINDOW",
      label: label("socso.skbbk.window"),
      value: bool(skbbkActive),
      detail: skbbkActive
        ? label("socso.skbbk.inWindow", {
            periodEnd: p.date(inputs.periodEnd),
            from: p.date(settings.skbbkPhaseFrom),
            to: p.date(settings.skbbkPhaseTo),
          })
        : label("socso.skbbk.outsideWindow", {
            periodEnd: p.date(inputs.periodEnd),
            from: p.date(settings.skbbkPhaseFrom),
            to: p.date(settings.skbbkPhaseTo),
          }),
      inputs: [{ nodeId: periodEndId, role: "AS_AT" }],
      citations: [cite("S2A", "MY.SOCSO.SKBBK.PHASE_WINDOW")],
    });

    const cat: SocsoCategory = cls.socsoCategory;
    const erColumn = cat === "FIRST" ? "cat1ErSen" : "cat2ErSen";
    const skbbkColumn = cat === "FIRST" ? "cat1EeSkbbkSen" : "cat2EeSkbbkSen";

    const erId = emitColumn(
      "line.socso.er",
      label("socso.er"),
      bandId,
      erColumn,
      socsoRes.erSen,
      label("socso.column", { category: p.enum("SOCSO_CATEGORY", cat) }),
      cite("S2", "MY.SOCSO.ACT4.BAND")
    );

    const coreId =
      cat === "FIRST"
        ? emitColumn(
            "line.socso.eeCore",
            label("socso.eeCore"),
            bandId,
            "cat1EeCoreSen",
            socsoRes.eeCoreSen,
            label("socso.column", { category: p.enum("SOCSO_CATEGORY", cat) }),
            cite("S2", "MY.SOCSO.ACT4.BAND")
          )
        : notApplicable(
            "line.socso.eeCore",
            label("socso.eeCore"),
            label("socso.na.category"),
            cite("S2", "MY.SOCSO.NOT_APPLICABLE")
          );

    const skbbkId = skbbkActive
      ? g.add({
          kind: "CALCULATION",
          id: "line.socso.eeSkbbk",
          op: "COLUMN_SELECT",
          column: skbbkColumn,
          label: label("socso.eeSkbbk"),
          value: sen(socsoRes.eeSkbbkSen),
          detail: label("socso.column", {
            category: p.enum("SOCSO_CATEGORY", cat),
          }),
          operands: [{ o: "REF", nodeId: bandId }],
          inputs: [
            { nodeId: bandId, role: "ROW" },
            { nodeId: windowId, role: "CONDITION" },
          ],
          citations: [cite("S2A", "MY.SOCSO.SKBBK.EMPLOYEE_BORNE")],
        })
      : g.add({
          kind: "CALCULATION",
          id: "line.socso.eeSkbbk",
          op: "COLUMN_SELECT",
          column: skbbkColumn,
          label: label("socso.eeSkbbk"),
          value: sen(0),
          detail: label("socso.skbbk.outsideWindow", {
            periodEnd: p.date(inputs.periodEnd),
            from: p.date(settings.skbbkPhaseFrom),
            to: p.date(settings.skbbkPhaseTo),
          }),
          operands: [{ o: "LITERAL", value: sen(0) }],
          inputs: [{ nodeId: windowId, role: "CONDITION" }],
          citations: [cite("S2A", "MY.SOCSO.SKBBK.PHASE_WINDOW")],
        });

    g.root(
      "socsoEr",
      applyOverride("SOCSO_ER", erId, socsoRes.erSen, "line.socso.er")
    );
    g.root(
      "socsoEeCore",
      applyOverride(
        "SOCSO_EE_CORE",
        coreId,
        socsoRes.eeCoreSen,
        "line.socso.eeCore"
      )
    );
    g.root(
      "socsoEeSkbbk",
      applyOverride(
        "SOCSO_EE_SKBBK",
        skbbkId,
        socsoRes.eeSkbbkSen,
        "line.socso.eeSkbbk"
      )
    );
  }

  // ------------------------------------------------------------------- EIS --

  const eisRes = eis(eisWages.amountSen, cls.eisEligible, tables.eis);
  emitEis();

  function emitEis(): void {
    const naReason = (): Label =>
      cls.eisEligible ? label("eis.na.noWages") : label("eis.na.notEligible");

    const emitNa = (): void => {
      const becauseOf = cls.eisEligible ? eisWages.id : eisEligibleId;
      const mk = (id: NodeId, lbl: Label): NodeId =>
        notApplicable(
          id,
          lbl,
          naReason(),
          cite("S3", "MY.EIS.NOT_APPLICABLE"),
          becauseOf
        );
      const ee = mk("line.eis.ee", label("eis.ee"));
      const er = mk("line.eis.er", label("eis.er"));
      g.root("eisEe", applyOverride("EIS_EE", ee, 0, "line.eis.ee"));
      g.root("eisEr", applyOverride("EIS_ER", er, 0, "line.eis.er"));
    };

    if (!cls.eisEligible || eisWages.amountSen <= 0) {
      emitNa();
      return;
    }

    const index = tables.eis.findIndex(
      (b) => eisWages.amountSen >= b.fromSen && eisWages.amountSen <= b.toSen
    );
    const band = index < 0 ? undefined : tables.eis[index];
    // As with EPF and SOCSO: `eis()` throws on a gap, so this can only mean the
    // emitter's search and the calculator's have diverged.
    if (band === undefined) {
      throw new Error(
        `derive: no EIS band for ${eisWages.amountSen} sen, but eis() found one`
      );
    }

    const prev = index > 0 ? tables.eis[index - 1] : undefined;
    const next =
      index + 1 < tables.eis.length ? tables.eis[index + 1] : undefined;

    const bandId = g.add({
      kind: "TABLE_LOOKUP",
      id: "line.eis.band",
      tableId: "EIS_ACT800",
      rowIndex: index,
      rowCount: tables.eis.length,
      keySen: eisWages.amountSen,
      neighbours: {
        ...(prev === undefined ? {} : { prev: bandRow(prev) }),
        ...(next === undefined ? {} : { next: bandRow(next) }),
      },
      label: label("eis.band"),
      value: { t: "ROW", row: bandRow(band) },
      detail: label("eis.band.matched", {
        wages: p.sen(eisWages.amountSen),
        from: p.sen(band.fromSen),
        to: p.sen(band.toSen),
        row: p.int(index + 1),
        rows: p.int(tables.eis.length),
      }),
      inputs: [
        { nodeId: eisWages.id, role: "KEY" },
        { nodeId: eisEligibleId, role: "REQUIRES" },
      ],
      citations: [cite("S3", "MY.EIS.ACT800.BAND", `row ${index + 1}`)],
    });

    const eeId = emitColumn(
      "line.eis.ee",
      label("eis.ee"),
      bandId,
      "eeSen",
      eisRes.eeSen,
      label("epf.column"),
      cite("S3", "MY.EIS.ACT800.BAND")
    );
    const erId = emitColumn(
      "line.eis.er",
      label("eis.er"),
      bandId,
      "erSen",
      eisRes.erSen,
      label("epf.columnEr"),
      cite("S3", "MY.EIS.ACT800.BAND")
    );
    g.root("eisEe", applyOverride("EIS_EE", eeId, eisRes.eeSen, "line.eis.ee"));
    g.root("eisEr", applyOverride("EIS_ER", erId, eisRes.erSen, "line.eis.er"));
  }

  // ------------------------------------------------------------------- PCB --

  const resolvedForPcb: ResolvedLineItem[] = [
    {
      payItemCode: "BASIC",
      basis: employee.payBasis === "MONTHLY" ? "FIXED_MONTHLY" : "PER_DAY",
      qty: null,
      rateSen: employee.baseRateSen,
      amountSen: reg.amountSen,
      computed: true,
    },
    ...resolveItems(inputs.items, matrix),
  ];
  const epfEeNode = g.get(g.rootOf("epfEe")).value;
  if (epfEeNode.t !== "SEN") {
    throw new Error("root epfEe is not a settled money value");
  }
  const pcbForNet = enrichPcbForCompute(
    opts.pcb ?? null,
    resolvedForPcb,
    epfEeNode.sen
  );
  const pcbRes = pcbNet(pcbForNet);
  const zakatSen = pcbForNet?.zakatOffsetSen ?? 0;

  const zakatId = g.add({
    kind: "INPUT",
    id: "line.pcb.zakat",
    label: label("pcb.zakat"),
    value: sen(zakatSen),
    inputs: [],
    citations: [],
    origin: "LINE_ENTRY",
    fieldPath: "pcb.zakatOffsetSen",
  });
  g.root("zakat", zakatId);

  /**
   * An employee outside PCB is a zero that statute explains, not an unknown.
   *
   * Modelling it as unknown was wrong in a way the totals hid: `line.pcb.net`
   * rendered as "—" while the deductions total quietly substituted zero, so the
   * graph showed a figure the arithmetic had not used. NOT_APPLICABLE states the
   * zero and cites why, and the total then adds a number the drill can reach.
   */
  // An amount that was actually entered or computed is deducted by `computeLine`
  // whatever the applicability flag says, so the graph follows the engine.
  const pcbResolved = pcbRes.grossPcbSen != null;
  const pcbNetId =
    employee.pcbApplicable || pcbResolved
      ? emitPcbApplicable()
      : emitPcbNotApplicable();
  g.root("pcbNet", pcbNetId);

  function emitPcbNotApplicable(): NodeId {
    const declared = notApplicable(
      "line.pcb.declared",
      label("pcb.declared"),
      label("pcb.na"),
      cite("S4", "MY.PCB.EXTERNAL_ONLY")
    );
    return notApplicable(
      "line.pcb.net",
      label("pcb.net"),
      label("pcb.na"),
      cite("S4", "MY.PCB.EXTERNAL_ONLY"),
      declared
    );
  }

  function emitPcbDeclaredComputed(): NodeId {
    const month = pcbForNet?.monthContext;
    if (month == null || pcbRes.grossPcbSen == null) {
      throw new Error(
        "COMPUTED PCB requires month context and a settled gross"
      );
    }
    const y1Id = g.add({
      kind: "INPUT",
      id: "line.pcb.y1",
      label: label("pcb.y1"),
      value: sen(month.y1Sen),
      inputs: [],
      citations: [],
      origin: "LINE_ENTRY",
      fieldPath: "pcb.monthContext.y1Sen",
    });
    const k1Id = g.add({
      kind: "INPUT",
      id: "line.pcb.k1",
      label: label("pcb.k1"),
      value: sen(month.k1Sen),
      inputs: [],
      citations: [],
      origin: "LINE_ENTRY",
      fieldPath: "pcb.monthContext.k1Sen",
    });
    return g.add({
      kind: "CALCULATION",
      id: "line.pcb.declared",
      op: "MAX",
      label: label("pcb.declared"),
      value: sen(pcbRes.grossPcbSen),
      detail: label("pcb.declared.computed", {
        source: p.text("P-SPEC-2026"),
      }),
      operands: [
        { o: "LITERAL", value: sen(pcbRes.grossPcbSen) },
        { o: "LITERAL", value: sen(0) },
      ],
      inputs: [
        { nodeId: y1Id, role: "Y1" },
        { nodeId: k1Id, role: "K1" },
      ],
      citations: [cite("S4", "MY.PCB.COMPUTERIZED")],
      flags: ["UNVERIFIED"],
    });
  }

  function emitPcbDeclaredExternal(): NodeId {
    const pcbStatus = ((): "VERIFIED" | "UNVERIFIED" | "NOT_ENTERED" => {
      if (pcbRes.grossPcbSen == null) {
        return "NOT_ENTERED";
      }
      return pcbRes.verified ? "VERIFIED" : "UNVERIFIED";
    })();
    const declaredSource = opts.pcbSource ?? "manual entry";
    return g.add({
      kind: "EXTERNAL_VERIFIED",
      id: "line.pcb.declared",
      label: label("pcb.declared"),
      value:
        pcbRes.grossPcbSen == null ? senUnknown() : sen(pcbRes.grossPcbSen),
      detail:
        pcbStatus === "NOT_ENTERED"
          ? label("pcb.declared.notEntered")
          : label("pcb.declared.entered", {
              source: p.text(declaredSource),
              status: p.enum("VERIFICATION_STATUS", pcbStatus),
            }),
      source: opts.pcbSource ?? null,
      verificationStatus: pcbStatus,
      ...(opts.pcbEvidenceRef === undefined
        ? {}
        : { evidenceRef: opts.pcbEvidenceRef }),
      inputs: [],
      citations: [cite("S4", "MY.PCB.EXTERNAL_ONLY")],
      flags: pcbStatus === "VERIFIED" ? [] : [pcbStatus],
    });
  }

  function emitPcbApplicable(): NodeId {
    const declaredId =
      pcbRes.path === "COMPUTED"
        ? emitPcbDeclaredComputed()
        : emitPcbDeclaredExternal();

    return g.add({
      kind: "CALCULATION",
      id: "line.pcb.net",
      op: "MAX",
      label: label("pcb.net"),
      value: pcbRes.netPcbSen === null ? senUnknown() : sen(pcbRes.netPcbSen),
      detail:
        pcbRes.netPcbSen === null
          ? label("pcb.declared.notEntered")
          : label("pcb.net.detail", { zakat: p.sen(zakatSen) }),
      operands: [
        { o: "REF", nodeId: declaredId },
        { o: "REF", nodeId: zakatId },
        { o: "LITERAL", value: sen(0) },
      ],
      inputs: [
        { nodeId: declaredId, role: "DECLARED" },
        { nodeId: zakatId, role: "OFFSET" },
      ],
      citations: [cite("S4", "MY.PCB.ZAKAT_OFFSET")],
      ...(pcbRes.netPcbSen === null
        ? { flags: ["NOT_ENTERED" as NodeFlag] }
        : {}),
    });
  }

  const cp38Id = g.add({
    kind: "INPUT",
    id: "line.pcb.cp38",
    label: label("pcb.cp38"),
    value: sen(pcbRes.cp38Sen),
    inputs: [],
    citations: [],
    origin: "LINE_ENTRY",
    fieldPath: "pcb.cp38Sen",
  });
  g.root("cp38", cp38Id);

  // ---------------------------------------------------------------- totals --

  const epfEeSen = readRootSen("epfEe");
  const epfErSen = readRootSen("epfEr");
  const socsoEeCoreSen = readRootSen("socsoEeCore");
  const socsoEeSkbbkSen = readRootSen("socsoEeSkbbk");
  const socsoErSen = readRootSen("socsoEr");
  const eisEeSen = readRootSen("eisEe");
  const eisErSen = readRootSen("eisEr");

  function readRootSen(key: RootKey): number {
    const v = g.get(g.rootOf(key)).value;
    if (v.t !== "SEN") {
      throw new Error(`root ${key} is not a settled money value`);
    }
    return v.sen;
  }

  const statutoryEeId = g.add({
    kind: "AGGREGATE",
    id: "line.deductions.statutoryEe",
    label: label("total.statutoryEe"),
    value: sen(epfEeSen + socsoEeCoreSen + socsoEeSkbbkSen + eisEeSen),
    inputs: [
      { nodeId: g.rootOf("epfEe"), role: ROLE_INCLUDED },
      { nodeId: g.rootOf("socsoEeCore"), role: ROLE_INCLUDED },
      { nodeId: g.rootOf("socsoEeSkbbk"), role: ROLE_INCLUDED },
      { nodeId: g.rootOf("eisEe"), role: ROLE_INCLUDED },
    ],
    citations: [],
  });

  const otherDeductionsSen = deductionRefs.reduce((s, d) => s + d.amountSen, 0);
  const otherId = g.add({
    kind: "AGGREGATE",
    id: "line.deductions.other",
    label: label("total.otherDeductions"),
    value: sen(otherDeductionsSen),
    ...(deductionRefs.length === 0
      ? { detail: label("total.otherDeductions.none") }
      : {}),
    inputs: deductionRefs.map((d) => ({ nodeId: d.id, role: ROLE_INCLUDED })),
    citations: [],
  });
  g.root("otherDeductions", otherId);

  const pcbMissing = employee.pcbApplicable && pcbRes.netPcbSen === null;
  const deductionsTotalSen = pcbMissing
    ? null
    : epfEeSen +
      socsoEeCoreSen +
      socsoEeSkbbkSen +
      eisEeSen +
      (pcbRes.netPcbSen ?? 0) +
      pcbRes.cp38Sen +
      otherDeductionsSen;

  const deductionsId = g.add({
    kind: "AGGREGATE",
    id: "line.deductions.total",
    label: label("total.deductions"),
    value: deductionsTotalSen === null ? senUnknown() : sen(deductionsTotalSen),
    ...(deductionsTotalSen === null
      ? { detail: label("total.deductions.pendingPcb") }
      : {}),
    inputs: [
      { nodeId: statutoryEeId, role: ROLE_INCLUDED },
      { nodeId: pcbNetId, role: ROLE_INCLUDED },
      { nodeId: cp38Id, role: ROLE_INCLUDED },
      { nodeId: otherId, role: ROLE_INCLUDED },
    ],
    citations: [],
    ...(deductionsTotalSen === null
      ? { flags: ["NOT_ENTERED" as NodeFlag] }
      : {}),
  });
  g.root("deductionsTotal", deductionsId);

  const netSen =
    deductionsTotalSen === null ? null : grossSen - deductionsTotalSen;
  const netId = g.add({
    kind: "CALCULATION",
    id: "line.net",
    op: "SUB",
    label: label("total.net"),
    value: netSen === null ? senUnknown() : sen(netSen),
    detail:
      netSen === null
        ? label("total.net.pendingPcb")
        : label("total.net.detail", {
            gross: p.sen(grossSen),
            deductions: p.sen(deductionsTotalSen ?? 0),
          }),
    operands: [
      { o: "REF", nodeId: grossId },
      { o: "REF", nodeId: deductionsId },
    ],
    inputs: [
      { nodeId: grossId, role: "MINUEND" },
      { nodeId: deductionsId, role: "SUBTRAHEND" },
    ],
    citations: [cite("L2", "MY.EA1955.REG9.WAGE_STATEMENT")],
    ...(netSen === null ? { flags: ["NOT_ENTERED" as NodeFlag] } : {}),
  });
  g.root("net", netId);

  // ------------------------------------------------------------------ HRDF --

  const hrdfPct = opts.hrdfLevyPct ?? settings.hrdfLevyPct;
  const hrdfEnabled = opts.hrdfLevyEnabled === true && hrdfPct > 0;

  const hrdfId = hrdfEnabled ? emitHrdf() : emitHrdfDisabled();

  function emitHrdf(): NodeId {
    const r = explainPctHalfUp(epfWages.amountSen, hrdfPct);
    const rateId = g.add({
      kind: "SETTING",
      id: "line.hrdf.rate",
      settingKey: "hrdf.levy_pct",
      rawValue: String(hrdfPct),
      label: label("setting.hrdf.levyPct"),
      value: pctFromNumber(hrdfPct),
      inputs: [],
      citations: [cite("S5", "MY.HRDF.LEVY")],
    });
    const productId = g.add({
      kind: "CALCULATION",
      id: "line.hrdf.product",
      op: "PCT",
      label: label("total.hrdf.detail", { pct: p.pctOf(hrdfPct) }),
      value: exactSen(r.exact, r.sen),
      operands: [
        { o: "REF", nodeId: epfWages.id },
        { o: "REF", nodeId: rateId },
      ],
      inputs: [
        { nodeId: epfWages.id, role: "BASE" },
        { nodeId: rateId, role: "RATE" },
      ],
      citations: [cite("S5", "MY.HRDF.LEVY")],
    });
    return emitRounding(
      "line.hrdf",
      label("total.hrdf"),
      productId,
      r.exact,
      r.sen,
      "HALF_UP_SEN"
    );
  }

  function emitHrdfDisabled(): NodeId {
    return notApplicable(
      "line.hrdf",
      label("total.hrdf"),
      label("total.hrdf.disabled"),
      cite("S5", "MY.HRDF.LEVY")
    );
  }
  g.root("hrdfLevy", hrdfId);

  const hrdfSen = readRootSen("hrdfLevy");
  const employerCostId = g.add({
    kind: "AGGREGATE",
    id: "line.employerCost",
    label: label("total.employerCost"),
    value: sen(grossSen + epfErSen + socsoErSen + eisErSen + hrdfSen),
    detail: label("total.employerCost.detail"),
    inputs: [
      { nodeId: grossId, role: ROLE_INCLUDED },
      { nodeId: g.rootOf("epfEr"), role: ROLE_INCLUDED },
      { nodeId: g.rootOf("socsoEr"), role: ROLE_INCLUDED },
      { nodeId: g.rootOf("eisEr"), role: ROLE_INCLUDED },
      { nodeId: hrdfId, role: ROLE_INCLUDED },
    ],
    citations: [],
  });
  g.root("employerCost", employerCostId);

  return g.build();
}
