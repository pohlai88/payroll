/**
 * Resolves the single approved statutory rule in force for a scheme, a rule
 * code and a date.
 *
 * A rule pack's identity is `(jurisdiction, authority, code, version)`.
 * `layer` is the scheme it speaks for (`STATUTORY_CALCULATION`,
 * `EMPLOYMENT_LAW`, `COMPANY_POLICY`) and `code` is the rule family within
 * it (`MY-STATUTORY`, `MY-EMPLOYMENT-LAW`, `MY-PCB`, ...). A rule pack *is*
 * the versioned statutory rule in this system — its `version`,
 * `effectiveFrom`/`effectiveTo`, band tables/settings, `contentHash` and
 * `status` are exactly the fields a "rule" needs, already governed by the
 * immutability and lifecycle triggers in `0003_statutory_authority.sql` and
 * `0004_authority_governance.sql`. This module adds nothing to that model; it
 * adds the one lookup the model was missing: turn `(scheme, ruleCode, date)`
 * into exactly one row, or refuse.
 *
 * This never orders by recency and returns the first result. A "latest"
 * fallback would silently paper over a bad state — two overlapping approved
 * packs, or nothing covering the date at all — with whatever happened to sort
 * first. Both are governance failures to report, not implementation details
 * to smooth over.
 */

import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import type { rulePackLayer } from "@/db/schema/enums";
import { rulePacks } from "@/db/schema/rule-pack";
import { isIsoDate } from "@/domain/date";

export type RuleScheme = (typeof rulePackLayer.enumValues)[number];

/**
 * Statuses that mean "this content was, at some point, taken responsibility
 * for". A `SUPERSEDED` pack is included deliberately: it was `APPROVED` before
 * a successor replaced it, and a historical date must still resolve to the
 * rule that was actually in force then — see "historical dates resolve
 * historical rules" in `tests/db/rule-resolution.test.ts`. `DRAFT`,
 * `SOURCE_CAPTURED` and `VERIFIED` are excluded unconditionally: nothing
 * short of approval may reach a payroll, however recent or plausible.
 */
const EVER_APPROVED_STATUSES = new Set(["APPROVED", "EFFECTIVE", "SUPERSEDED"]);

export interface RuleResolutionRequest {
  /** `rule_packs.layer` — which governance regime the rule belongs to. */
  readonly scheme: RuleScheme;
  /** `rule_packs.code` — the rule family, e.g. `MY-STATUTORY`. */
  readonly ruleCode: string;
  /** ISO `yyyy-mm-dd`: the date payroll treats as "the law in force". */
  readonly statutoryDate: string;
  /**
   * `rule_packs.jurisdiction` — ISO 3166-1 alpha-2, or a subdivision code
   * where a rule is state-level. Defaults to `MY`: every pack seeded so far
   * is national, but a state-level variant sharing `code` with the national
   * pack (e.g. a Sabah/Sarawak overtime rule) must not be treated as the same
   * rule family, or as ambiguous with it.
   */
  readonly jurisdiction?: string;
}

export interface ResolvedRule {
  readonly rulePackId: string;
  readonly scheme: RuleScheme;
  readonly ruleCode: string;
  readonly version: string | null;
  readonly status: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly contentHash: string | null;
}

/** Raised for every way resolution can fail. The message says which. */
export class RuleResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleResolutionError";
  }
}

export async function resolveRule(
  db: DbOrTx,
  request: RuleResolutionRequest
): Promise<ResolvedRule> {
  const { scheme, ruleCode, statutoryDate, jurisdiction = "MY" } = request;
  const what = `scheme=${scheme} ruleCode=${ruleCode} jurisdiction=${jurisdiction} date=${statutoryDate}`;

  if (!isIsoDate(statutoryDate)) {
    throw new RuleResolutionError(
      `cannot resolve ${what}: statutoryDate must be a real ISO yyyy-mm-dd date`
    );
  }

  const candidates = await db
    .select({
      id: rulePacks.id,
      version: rulePacks.version,
      status: rulePacks.status,
      effectiveFrom: rulePacks.effectiveFrom,
      effectiveTo: rulePacks.effectiveTo,
      contentHash: rulePacks.contentHash,
    })
    .from(rulePacks)
    .where(
      and(
        eq(rulePacks.layer, scheme),
        eq(rulePacks.code, ruleCode),
        eq(rulePacks.jurisdiction, jurisdiction),
        lte(rulePacks.effectiveFrom, statutoryDate),
        or(
          isNull(rulePacks.effectiveTo),
          gte(rulePacks.effectiveTo, statutoryDate)
        )
      )
    );

  if (candidates.length === 0) {
    throw new RuleResolutionError(
      `no rule pack covers ${what}: nothing is effective for this scheme and rule code on this date`
    );
  }

  const approved = candidates.filter((c) =>
    EVER_APPROVED_STATUSES.has(c.status)
  );

  if (approved.length === 0) {
    const statuses = [...new Set(candidates.map((c) => c.status))]
      .sort()
      .join(", ");
    throw new RuleResolutionError(
      `rule pack(s) cover ${what} but none has ever been approved (status: ${statuses}): ` +
        "only an approved rule may be used in production payroll"
    );
  }

  if (approved.length > 1) {
    const ids = approved
      .map((c) => c.id)
      .sort((a, b) => a.localeCompare(b))
      .join(", ");
    throw new RuleResolutionError(
      `ambiguous resolution for ${what}: ${approved.length} approved rule packs overlap this date ` +
        `(${ids}) — this is a governance conflict, not a lookup to guess through; ` +
        "supersede one or correct their effective ranges"
    );
  }

  const [rule] = approved;
  if (rule === undefined) {
    // Unreachable: `approved.length === 1` was just asserted above.
    throw new RuleResolutionError(`internal error resolving ${what}`);
  }

  return {
    rulePackId: rule.id,
    scheme,
    ruleCode,
    version: rule.version,
    status: rule.status,
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo,
    contentHash: rule.contentHash,
  };
}
