/**
 * The marketing doctrine, as assertions.
 *
 * Every check here exists because a real defect got through review without it.
 * The page makes claims about traceability; these are what stop the page from
 * being the least traceable artifact in the repository.
 */

import { describe, expect, it } from "vitest";
import { rulePackStatus } from "@/db/schema/enums";
import {
  CLOSING,
  CONTROL_PROOF,
  DECISION_CONTROLS,
  DIFF_ROWS,
  formatIsoDate,
  formatRinggit,
  formatSen,
  HERO,
  ILLUSTRATIVE_DIFF_NOTE,
  LEDGER_EMPLOYEE,
  LEDGER_GROSS_SEN,
  LEDGER_NET_SEN,
  NAV_LINKS,
  PACK_STATUSES,
  PCB_NOTE,
  RESOLVABLE_PACK_STATUSES,
  RULE_PACK,
  SCENARIO,
  SOURCES,
} from "@/marketing/content";

describe("operator-facing claim boundaries", () => {
  it("leads with the enforcement-first headline", () => {
    expect(HERO.title).toBe("Payroll does not move until the controls clear.");
    expect(HERO.body).toContain("revision checks");
    expect(HERO.body).toContain("unresolved findings");
  });

  it("states the three supported operator controls", () => {
    expect(DECISION_CONTROLS.map((control) => control.label)).toEqual([
      "Find the blocker",
      "Protect the decision",
      "Control the release",
    ]);
  });

  it("labels the rule-change comparison as illustrative", () => {
    expect(ILLUSTRATIVE_DIFF_NOTE).toContain(
      "Illustrative effective-date comparison"
    );
    expect(ILLUSTRATIVE_DIFF_NOTE).not.toContain(
      "names the authority that caused"
    );
  });

  it("does not make universal explainability a release condition", () => {
    expect(CLOSING.headline).toBe(
      "Payroll does not move until the controls clear."
    );
    expect(CLOSING.headline).not.toMatch(/cannot be released/i);
  });
});

describe("reconciliation", () => {
  /**
   * The RM9.00 defect: an earlier draft displayed a net figure that its own
   * deductions did not produce, because the figures were hand-authored.
   */
  it("gross minus every branch equals the displayed net, to the sen", () => {
    const deductions = LEDGER_EMPLOYEE.reduce(
      (total, row) => total + row.sen,
      0
    );
    expect(LEDGER_GROSS_SEN - deductions).toBe(LEDGER_NET_SEN);
  });

  it("holds every figure as integer sen", () => {
    for (const row of LEDGER_EMPLOYEE) {
      expect(Number.isInteger(row.sen)).toBe(true);
    }
    expect(Number.isInteger(LEDGER_GROSS_SEN)).toBe(true);
    expect(Number.isInteger(LEDGER_NET_SEN)).toBe(true);
  });

  it("formats sen without losing a cent", () => {
    expect(formatSen(LEDGER_NET_SEN)).toBe("5,386.20");
    expect(formatSen(4465)).toBe("44.65");
  });

  it("formats ringgit and ISO dates through Intl helpers", () => {
    expect(formatRinggit(LEDGER_NET_SEN)).toBe("RM\u00A05,386.20");
    expect(formatIsoDate("2026-06-01")).toBe(RULE_PACK.effectiveFrom);
    expect(formatIsoDate("2026-07-31")).toBe(SCENARIO.calculationDate);
  });
});

describe("provenance", () => {
  it("cites a ref that exists in the source register", () => {
    const refs = new Set(SOURCES.map((source) => source.ref));
    for (const row of LEDGER_EMPLOYEE) {
      expect(refs).toContain(row.ref);
    }
  });

  it("shows evidence honestly, including where no digest exists", () => {
    const withoutDigest = SOURCES.filter((source) => source.digest === null);
    expect(withoutDigest.map((source) => source.ref)).toEqual(["S4", "S5"]);
  });
});

describe("amber is a controlled signal", () => {
  /**
   * Amber may only mark a ceiling that genuinely binds. An earlier draft applied
   * the RM6,000 ceiling to a RM4,500 wage, which is dramatisation, not fact.
   */
  it("marks a ceiling as binding only where the wage exceeds it", () => {
    const CEILING_SEN = 600_000;
    expect(SCENARIO.wageSen).toBeGreaterThan(CEILING_SEN);

    const binding = LEDGER_EMPLOYEE.filter((row) => row.ceilingBinds);
    expect(binding.map((row) => row.root)).toEqual(["socsoEeCore", "eisEe"]);
  });
});

describe("PCB is not claimed as a Clarity calculation", () => {
  it("is carried as an externally verified figure", () => {
    const pcb = LEDGER_EMPLOYEE.find((row) => row.root === "pcbNet");
    expect(pcb?.kind).toBe("EXTERNAL_VERIFIED");
  });

  it("is the only externally verified figure in the example", () => {
    const external = LEDGER_EMPLOYEE.filter(
      (row) => row.kind === "EXTERNAL_VERIFIED"
    );
    expect(external).toHaveLength(1);
  });

  /**
   * "never computes" is a permanent product promise, and naming e-PCB alone is
   * too narrow: HASiL permits the computerised method or the prescribed
   * schedule.
   */
  it("states the boundary without over-promising or naming one portal", () => {
    expect(PCB_NOTE).toContain("does not independently calculate PCB");
    expect(PCB_NOTE).toContain("approved HASiL calculation method");
    expect(PCB_NOTE).toContain("remains unresolved");
    expect(PCB_NOTE).not.toContain("never computes");
    expect(PCB_NOTE).not.toContain("e-PCB");
  });
});

describe("participation is stated, not implied", () => {
  /**
   * LINDUNG 24 JAM is voluntary for local employees, so a SKBBK deduction on a
   * Malaysian employee is unexplained unless the scenario says they opted in.
   */
  it("declares participation wherever it is what makes a deduction apply", () => {
    const skbbk = LEDGER_EMPLOYEE.find((row) => row.root === "socsoEeSkbbk");
    expect(skbbk?.participation).toBe("Opted in");
    expect(SCENARIO.participation).toBe("Opted in");
  });
});

describe("authority claims establish governance and applicability", () => {
  it("mirrors the resolver's admitted statuses, superseded included", () => {
    const resolvable = PACK_STATUSES.filter((status) => status.resolvable).map(
      (status) => status.label
    );
    expect(resolvable).toEqual([...RESOLVABLE_PACK_STATUSES]);
    expect(resolvable).toContain("SUPERSEDED");
  });

  it("only labels statuses the schema actually defines", () => {
    const declared = new Set<string>(rulePackStatus.enumValues);
    for (const status of PACK_STATUSES) {
      expect(declared).toContain(status.label);
    }
    expect(PACK_STATUSES).toHaveLength(rulePackStatus.enumValues.length);
  });

  it("cites a pack whose governance status permits runtime use", () => {
    expect(RESOLVABLE_PACK_STATUSES).toContain(RULE_PACK.status);
  });

  /**
   * Gate 4. Approval is not applicability: an approved pack that takes effect
   * later must never illustrate an earlier period.
   */
  it("cites a pack whose effective range covers the calculation date", () => {
    expect(RULE_PACK.effectiveFromIso <= SCENARIO.calculationDateIso).toBe(
      true
    );
    expect(RULE_PACK.effectiveToIso).toBeNull();
  });
});

describe("the rule-change diff keeps unchanged rows", () => {
  it("lists every branch, moved or not", () => {
    expect(DIFF_ROWS).toHaveLength(LEDGER_EMPLOYEE.length);
  });

  it("moves exactly the branch the effective date changed", () => {
    const moved = DIFF_ROWS.filter((row) => row.beforeSen !== row.afterSen);
    expect(moved).toHaveLength(1);
    expect(moved[0]?.label).toBe("SKBBK employee");
  });
});

describe("heads-up enforcement content model", () => {
  it("locks the heads-up enforcement headline", () => {
    expect(HERO.title).toBe("Payroll does not move until the controls clear.");
    expect(HERO.body).toContain("revision checks");
    expect(HERO.body).toContain("unresolved findings");
  });

  it("models revision mismatch as a control, not a finding", () => {
    expect(CONTROL_PROOF.title).toBe("Approval cannot proceed.");
    expect(CONTROL_PROOF.kicker).toBe("Approval gate · revision control");
    expect(CONTROL_PROOF.invariant).toBe("reviewedRevision ≠ calcRevision");
    expect(CONTROL_PROOF.title.toLowerCase()).not.toContain("finding");
    expect(CONTROL_PROOF.body.toLowerCase()).not.toMatch(/\bfinding\b/);
  });

  it("points nav at the heads-up spine anchors", () => {
    expect(NAV_LINKS.map((l) => l.href)).toEqual([
      "#control",
      "#asks",
      "#failure",
      "#proof",
      "#authority",
      "#next",
    ]);
  });
});
