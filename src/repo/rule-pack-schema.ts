/**
 * @feature pay-run
 * @layer repo
 * @hub src/server/routes/pay-run.ts
 *
 * The Zod boundary for rule-pack settings.
 *
 * `rule_settings.settings` is jsonb, so the database cannot vouch for its shape.
 * A missing statutory setting is a misconfigured rule pack, not a default — this
 * is where that becomes an error with a field path instead of an `undefined`
 * reaching the arithmetic.
 */

import { z } from "zod";
import type { RuleSettings } from "@/domain/calc/types";

const senAmount = z.number().int().nonnegative();
const percentage = z.number().min(0).max(100);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date (yyyy-mm-dd)");

/**
 * Statutory limits: gazetted maxima the *findings* engine reads.
 *
 * Nothing in this phase consumes them, and no calculation ever will — a breach
 * of a working-hours limit is a fact to flag, never a figure to change. The
 * block is optional because a pack is only allowed to carry limits that have
 * been verified against the instrument that sets them; a pack with none is
 * honest, a pack with guessed ones is not.
 */
const statutoryLimits = z.object({
  /** Employment (Limitation of Overtime Work) Regulations 1980. */
  otMaxHoursMonth: z.number().positive(),
  /** Employment Act 1955 s.60A(1), as amended. */
  maxWeeklyHours: z.number().positive(),
  /** The Minimum Wages Order in force, in sen per month. */
  minWageSen: senAmount,
  /** Floors, not rates: an employer may pay more. */
  otMultiplierFloors: z.object({
    workday: z.number().positive(),
    restDay: z.number().positive(),
    publicHoliday: z.number().positive(),
  }),
  /** Employment Act 1955 First Schedule wage ceiling, in sen. */
  eaEntitlementWageCeilingSen: senAmount,
});

const ruleSettingsSchema = z.object({
  epfTableCeilingSen: senAmount,
  epfAboveEePct: percentage,
  epfAboveErPctLeThreshold: percentage,
  epfAboveErPctGtThreshold: percentage,
  epfErThresholdSen: senAmount,
  epfPartCAboveEePct: percentage,
  epfPartCAboveErPct: percentage,
  epfPartEAboveEePct: percentage,
  epfPartEAboveErPct: percentage,
  epfPartFEePct: percentage,
  epfPartFErPct: percentage,
  socsoCeilingSen: senAmount,
  epfSocsoRetirementAge: z.number().int().positive(),
  skbbkPhaseFrom: isoDate,
  skbbkPhaseTo: isoDate,
  eisCeilingSen: senAmount,
  eisMinAge: z.number().int().nonnegative(),
  eisMaxAgeExclusive: z.number().int().positive(),
  eisFirstTimeReviewAge: z.number().int().positive(),
  hrdfLevyPct: percentage,
  statutoryLimits: statutoryLimits.optional(),
});

/** The persisted document: the engine's `RuleSettings` plus the limits block. */
export type PersistedRuleSettings = z.infer<typeof ruleSettingsSchema>;

export function parseRuleSettings(
  value: unknown,
  rulePackId: string
): PersistedRuleSettings {
  const parsed = ruleSettingsSchema.safeParse(value);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(
      `rule pack ${rulePackId} has invalid settings — ${problems}`
    );
  }
  return parsed.data;
}

/**
 * The engine's view. `statutoryLimits` is deliberately dropped: `RuleSettings`
 * is what the calculators consume, and limits are not calculation inputs.
 */
export function toEngineSettings(
  settings: PersistedRuleSettings
): RuleSettings {
  const { statutoryLimits: _limits, ...engine } = settings;
  return engine;
}
