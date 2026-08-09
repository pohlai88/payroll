/**
 * @feature pay-run
 * @layer test
 *
 * Postgres enum members must equal the TypeScript unions, in both directions.
 *
 * The schema writes its enum members out literally rather than deriving them,
 * so that adding a union member cannot silently change the database's idea of
 * what is legal. This is the test that makes that choice safe: it fails the
 * moment the two drift, naming the members that differ.
 */

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { QUANTITY_BASES } from "@/domain/calc/types";
import { connectTestDatabase, type TestDatabase } from "./harness/database";

const database: TestDatabase = connectTestDatabase();

afterAll(async () => {
  await database.close();
});

async function membersOf(enumName: string): Promise<string[]> {
  const result = await database.db.execute<{ label: string }>(sql`
    SELECT e.enumlabel AS label
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = ${enumName}
    ORDER BY e.enumsortorder`);
  return result.rows.map((r) => r.label);
}

/**
 * The TypeScript side, written out literally for the same reason the schema is:
 * a union cannot be enumerated at runtime, so something has to state it, and a
 * mismatch between these three places is exactly what the test is looking for.
 */
const EXPECTED: Record<string, readonly string[]> = {
  pay_item_kind: ["EARNING", "DEDUCTION"],
  rate_basis: ["FIXED_MONTHLY", "PER_DAY", "PER_HOUR", "PER_UNIT", "AMOUNT"],
  pay_basis: ["MONTHLY", "DAILY", "HOURLY"],
  employee_custom_field_data_type: ["TEXT", "NUMBER", "DATE", "BOOLEAN"],
  epf_part: ["A", "C", "E", "F", "NONE"],
  socso_category: ["FIRST", "SECOND", "NONE"],
  rule_pack_layer: [
    "STATUTORY_CALCULATION",
    "EMPLOYMENT_LAW",
    "COMPANY_POLICY",
  ],
  rule_pack_status: [
    "DRAFT",
    "SOURCE_CAPTURED",
    "VERIFIED",
    "APPROVED",
    "EFFECTIVE",
    "SUPERSEDED",
  ],
  verification_method: [
    "HUMAN_REVIEW_OF_OFFICIAL_PDF",
    "OFFICIAL_HTML_PAGE",
    "OFFICIAL_API",
    "ISSUER_CORRESPONDENCE",
  ],
  run_status: ["DRAFT", "REVIEWED", "APPROVED", "CLOSED"],
  run_type: ["REGULAR", "OFFCYCLE"],
  offcycle_reason: [
    "CORRECTION",
    "ARREARS",
    "BONUS",
    "MISSED_PAYMENT",
    "FINAL_PAYMENT",
  ],
  override_field: [
    "EPF_EE",
    "EPF_ER",
    "SOCSO_EE_CORE",
    "SOCSO_EE_SKBBK",
    "SOCSO_ER",
    "EIS_EE",
    "EIS_ER",
    "EPF_WAGES",
    "SOCSO_WAGES",
    "EIS_WAGES",
  ],
  pcb_residence: ["RESIDENT", "NON_RESIDENT"],
  pcb_category: ["1", "2", "3"],
  pcb_formula_regime: ["NORMAL", "REP", "KNOWLEDGE_WORKER", "C_SUITE"],
  user_status: ["ACTIVE", "DISABLED"],
  role_scope: ["GLOBAL", "COMPANY"],
  permission_resource: [
    "COMPANY",
    "EMPLOYMENT",
    "PAY_RUN",
    "PAY_ITEM",
    "RULE_PACK",
    "REPORT",
  ],
  permission_action: ["CREATE", "READ", "UPDATE", "DELETE"],
  termination_reason: [
    "RESIGNATION",
    "DISMISSAL",
    "CONTRACT_END",
    "INTERNAL_GROUP_TRANSFER",
    "RETIREMENT",
    "OTHER",
  ],
  group_service_continuity: ["CONTINUOUS", "RESET"],
  artifact_entity_type: [
    "TRANSFER",
    "EMPLOYMENT_PRIOR_YTD",
    "PAY_RUN",
    "OTHER",
  ],
  artifact_type: [
    "EVIDENCE",
    "PAYMENT_REGISTER",
    "BANK_FILE",
    "CASH_SHEET",
    "PAYSLIP_PDF",
    "MANIFEST",
    "EXCEPTION_REPORT",
    "TIMESTAMP_TOKEN",
  ],
  artifact_source: ["ATTACHED", "GENERATED"],
  finding_severity: ["INFO", "REVIEW", "WARNING", "BLOCKING"],
  finding_status: ["OPEN", "ACKNOWLEDGED", "RESOLVED"],
  finding_event_kind: ["DETECTED", "REOPENED", "ACKNOWLEDGED", "RESOLVED"],
  treatment_scheme: ["EPF", "SOCSO", "EIS", "HRD"],
  treatment_source: ["STATUTORY_DEFAULT", "APPROVED_DEPARTURE"],
  pcb_remuneration_class: ["NORMAL", "ADDITIONAL", "EXCLUDED"],
  line_payment_state: [
    "READY",
    "HOLD",
    "RELEASED",
    "PAID",
    "FAILED_RETURNED",
    "RECONCILED",
    "WITHDRAWN",
  ],
  withdrawal_reason: [
    "MOVED_TO_OFFCYCLE",
    "DUPLICATE_LINE",
    "EMPLOYEE_NOT_PAYABLE",
    "PAYMENT_CANCELLED_BY_AUTHORITY",
    "OTHER_CONTROLLED_EXCEPTION",
  ],
  release_method: ["BANK", "CASH"],
  release_batch_status: [
    "OPEN",
    "SETTLED",
    "PARTIALLY_SETTLED",
    "SETTLED_WITH_FAILURES",
    "CANCELLED",
  ],
  payment_attempt_status: ["PENDING", "PAID", "FAILED"],
  distribution_channel: ["GENERATED", "SENT", "DELIVERED", "HANDED", "PRINTED"],
  gate_kind: ["REVIEW", "APPROVAL", "RELEASE", "CLOSE"],
};

describe("Postgres enums match the domain unions", () => {
  for (const [enumName, expected] of Object.entries(EXPECTED)) {
    it(`${enumName} has exactly its declared members`, async () => {
      const actual = await membersOf(enumName);
      expect(
        actual.length,
        `${enumName} exists in the database`
      ).toBeGreaterThan(0);
      expect([...actual].sort()).toEqual([...expected].sort());
    });
  }

  it("covers every enum the database defines", async () => {
    const result = await database.db.execute<{ typname: string }>(sql`
      SELECT t.typname
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typtype = 'e'
      ORDER BY t.typname`);
    expect(
      result.rows.map((r) => r.typname).sort((a, b) => a.localeCompare(b))
    ).toEqual(Object.keys(EXPECTED).sort());
  });

  /**
   * `rate_basis` carries a second obligation: the quantity bases the engine
   * discriminates on are the ones the database's shape checks treat as
   * quantity-bearing. If a basis were added to one side only, an item could be
   * stored in a shape the engine cannot resolve.
   */
  it("agrees with the engine about which bases carry a quantity", async () => {
    const all = await membersOf("rate_basis");
    const nonQuantity = all.filter(
      (b) => !(QUANTITY_BASES as readonly string[]).includes(b)
    );
    const alphabetical = (a: string, b: string): number => a.localeCompare(b);
    expect([...QUANTITY_BASES].sort(alphabetical)).toEqual([
      "PER_DAY",
      "PER_HOUR",
      "PER_UNIT",
    ]);
    expect(nonQuantity.sort(alphabetical)).toEqual(["AMOUNT", "FIXED_MONTHLY"]);
  });
});
