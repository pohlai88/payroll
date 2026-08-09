/**
 * @feature marketing
 * @layer ui
 *
 * Marketing copy and figures.
 *
 * Every statutory number below is read from the shipped rule pack
 * (db/seed/rule-pack-meta.json, epf-part-a.json, socso-skbbk.json, eis.json)
 * rather than invented, and money is held as integer sen and formatted once —
 * the same discipline the engine itself enforces.
 *
 * Four gates govern what may appear here, each of which caught a real defect
 * during design review:
 *
 * 1. No capability is claimed unless it exists in `src/`.
 * 2. No monetary figure is hand-authored; every one is a pack value.
 * 3. No test-harness or CI control is described as a runtime control. The golden
 *    master is a build gate, not a release gate, and is not claimed as one.
 * 4. An authority claim must establish both governance eligibility and temporal
 *    applicability. `RULE_PACK` therefore carries machine-checkable effective
 *    dates and a status, and `SCENARIO` carries the calculation date, so
 *    `tests/marketing` can assert the pack actually governed the example.
 */

const SEN_PER_RINGGIT = 100;
const ISO_CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const ringgitFormat = new Intl.NumberFormat("en-MY", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const isoDateFormat = new Intl.DateTimeFormat("en-MY", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Sen in, display string out. The only money formatter on this surface. */
export function formatSen(sen: number): string {
  return ringgitFormat.format(sen / SEN_PER_RINGGIT);
}

/** Ringgit with a non-breaking space so "RM" never orphans from the figure. */
export function formatRinggit(sen: number): string {
  return `RM\u00A0${formatSen(sen)}`;
}

/** Calendar ISO (`YYYY-MM-DD`) → locale display via Intl (never hand-shaped). */
export function formatIsoDate(isoDate: string): string {
  const match = ISO_CALENDAR_DATE.exec(isoDate);
  if (match === null) {
    throw new Error(`Invalid ISO calendar date: ${isoDate}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return isoDateFormat.format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * The pack in force. `status` and the ISO range exist so gate 4 can be
 * asserted rather than asserted-to: `SUPERSEDED` is included in the resolver's
 * admitted set alongside `APPROVED` and `EFFECTIVE`, but governance status is
 * only half the test — the effective range has to cover the calculation date
 * independently.
 */
export const RULE_PACK = {
  id: "MY-STATUTORY-2026-06",
  effectiveFromIso: "2026-06-01",
  effectiveFrom: formatIsoDate("2026-06-01"),
  effectiveToIso: null,
  status: "EFFECTIVE",
  summary: "EPF Oct 2025 · SOCSO + SKBBK Jun 2026 · EIS Oct 2024",
} as const;

/** Statuses `resolveRule` will admit. Mirrors EVER_APPROVED_STATUSES. */
export const RESOLVABLE_PACK_STATUSES: readonly string[] = [
  "APPROVED",
  "EFFECTIVE",
  "SUPERSEDED",
] as const;

/**
 * The scenario behind the proof tree, as data rather than prose.
 *
 * Participation is load-bearing, not decoration: LINDUNG 24 JAM is voluntary
 * for local employees, so a SKBBK deduction on a Malaysian employee is
 * unexplained unless the scenario states the employee opted in.
 */
export const SCENARIO = {
  employee: "Malaysian employee · under 60 · EPF Part A · category 1",
  participation: "Opted in",
  wageSen: 650_000,
  calculationDateIso: "2026-07-31",
  calculationDate: formatIsoDate("2026-07-31"),
} as const;

export interface Source {
  readonly ref: string;
  readonly issuer: string;
  readonly title: string;
  readonly retrievedAt: string;
  readonly digest: string | null;
}

/** The eight cited documents behind every figure. Verbatim from the rule pack. */
export const SOURCES: readonly Source[] = [
  {
    ref: "S1",
    issuer: "KWSP / EPF",
    title: "EPF Act 1991 Third Schedule, Parts A / C / E",
    retrievedAt: "2026-08-06",
    digest: "c4904e44",
  },
  {
    ref: "S2",
    issuer: "PERKESO",
    title: "Act 4 contribution table, including SKBBK",
    retrievedAt: "2026-08-06",
    digest: "e76b2a03",
  },
  {
    ref: "S2A",
    issuer: "PERKESO",
    title: "LINDUNG 24 JAM / SKBBK — Phase 1 guidance",
    retrievedAt: "2026-08-06",
    digest: "c5dd1782",
  },
  {
    ref: "S3",
    issuer: "PERKESO",
    title: "EIS Act 800 table, RM6,000 wage ceiling",
    retrievedAt: "2026-08-06",
    digest: "fa6a0d20",
  },
  {
    ref: "S4",
    issuer: "HASiL / LHDN",
    title: "PCB and CP38 approved methods; remit by the 15th",
    retrievedAt: "2026-08-06",
    digest: null,
  },
  {
    ref: "S5",
    issuer: "HRD Corp",
    title: "HRD Corp levy thresholds and rates",
    retrievedAt: "2026-08-06",
    digest: null,
  },
  {
    ref: "L1",
    issuer: "JTKSM / MOHR",
    title: "Employment Act 1955 s.18A proration; s.19 pay date",
    retrievedAt: "2026-08-06",
    digest: "c4d9d149",
  },
  {
    ref: "L2",
    issuer: "JTKSM / MOHR",
    title: "Employment Regulations 1957 reg. 9 — wage statement",
    retrievedAt: "2026-08-06",
    digest: "92613f15",
  },
] as const;

/**
 * How a figure earns its place on a payslip. `DERIVED` figures carry a
 * calculation and a rule; `EXTERNAL_VERIFIED` figures carry a source and a
 * verification. Conflating the two is what made the earlier hero line wrong.
 */
export type FigureKind = "DERIVED" | "EXTERNAL_VERIFIED";

export interface LedgerRow {
  readonly root: string;
  readonly label: string;
  readonly sen: number;
  readonly ref: string;
  readonly issuer: string;
  readonly note: string;
  readonly kind: FigureKind;
  /** True only where the wage genuinely exceeds the statutory ceiling. */
  readonly ceilingBinds: boolean;
  /** Set only where participation is what makes the deduction apply. */
  readonly participation: string | null;
}

export const LEDGER_GROSS_SEN = 650_000;

/**
 * The reconciled result, declared rather than computed, so that editing any
 * branch below breaks `tests/marketing/reconciliation.test.tsx` instead of
 * silently re-totalling. This is the RM9.00 defect class, held by a test.
 */
export const LEDGER_NET_SEN = 538_620;

/**
 * One month for one employee, Part A, category 1, under 60, opted in to
 * LINDUNG 24 JAM. Figures are the exact band values the shipped rule pack
 * returns for a RM6,500.00 monthly wage — above the RM6,000 SOCSO and EIS
 * ceiling, which is why those two branches show a ceiling as binding and the
 * others do not.
 */
export const LEDGER_EMPLOYEE: readonly LedgerRow[] = [
  {
    root: "epfEe",
    label: "EPF employee",
    sen: 71_500,
    ref: "S1",
    issuer: "KWSP",
    note: "Third Schedule Part A, band 6,400.01–6,500.00",
    kind: "DERIVED",
    ceilingBinds: false,
    participation: null,
  },
  {
    root: "socsoEeCore",
    label: "SOCSO employee",
    sen: 2975,
    ref: "S2",
    issuer: "PERKESO",
    note: "Act 4 first category, above the RM6,000 ceiling",
    kind: "DERIVED",
    ceilingBinds: true,
    participation: null,
  },
  {
    root: "socsoEeSkbbk",
    label: "SKBBK employee",
    sen: 4465,
    ref: "S2A",
    issuer: "PERKESO",
    note: "Employee-borne during Phase 1, Jun 2026 – May 2028",
    kind: "DERIVED",
    ceilingBinds: false,
    participation: "Opted in",
  },
  {
    root: "eisEe",
    label: "EIS employee",
    sen: 1190,
    ref: "S3",
    issuer: "PERKESO",
    note: "Act 800, capped at the RM6,000 ceiling",
    kind: "DERIVED",
    ceilingBinds: true,
    participation: null,
  },
  {
    root: "pcbNet",
    label: "PCB",
    sen: 31_250,
    ref: "S4",
    issuer: "HASiL",
    note: "Obtained through an approved HASiL method or source, then verified",
    kind: "EXTERNAL_VERIFIED",
    ceilingBinds: false,
    participation: null,
  },
] as const;

/**
 * Deliberately not "never computes PCB": a permanent product promise would
 * become awkward if a HASiL-approved computerised method is implemented later.
 * Deliberately not "entered from e-PCB" either — HASiL permits the computerised
 * calculation method or the prescribed schedule, with several submission
 * mechanisms, so naming a single portal is both too narrow and quick to age.
 */
export const PCB_NOTE =
  "Clarity does not independently calculate PCB. The amount is obtained through an approved HASiL calculation method or verified source and carried into the run as an externally verified fact. If the required PCB fact is absent, the affected result remains unresolved rather than silently defaulting to zero.";

export const HERO = {
  eyebrow: "Payroll control",
  title: "Payroll does not move until the controls clear.",
  body: "Every run must clear its current revision checks and unresolved findings before it can move through review, approval or release.",
} as const;

export interface ControlProofStage {
  readonly name: string;
  readonly value: string;
  readonly tone: string;
}

export const CONTROL_PROOF = {
  label: "Control state",
  state: "Blocked",
  kicker: "Approval gate · revision control",
  title: "Approval cannot proceed.",
  body: "The calculation changed after review. The run must be reviewed again before approval can proceed.",
  invariant: "reviewedRevision ≠ calcRevision",
  stages: [
    { name: "Review", value: "Required again", tone: "teal" },
    { name: "Approval", value: "Blocked", tone: "amber" },
    { name: "Release", value: "Not yet available", tone: "dim" },
  ],
  foot: "Gate certification records the current calculation revision and statutory authority.",
  illustrative: "Illustrative control state",
} as const;

export const HERO_ASSURANCE = [
  "Revision-bound review",
  "Finding-led gates",
  "Auditable control passage",
] as const;

/**
 * Movement 3 — illustrative finding vignette (distinct from Movement 1's
 * revision gate prerequisite). PCB_UNVERIFIED is a real catalog ruleId.
 */
export const CONTROL_FAILURE = {
  eyebrow: "When a control fails",
  title: "Payroll stops at the gate that failed.",
  findingTitle: "1 blocking finding prevents approval.",
  code: "PCB_UNVERIFIED · BLOCKING · APPROVAL",
  body: "PCB has not been verified against an approved calculation method or verified source.",
  illustrative: "Illustrative finding · not customer data",
} as const;

export interface DecisionControl {
  readonly index: string;
  readonly label: string;
  readonly question: string;
  readonly body: string;
  readonly evidence: string;
}

export const DECISION_CONTROLS: readonly DecisionControl[] = [
  {
    index: "01",
    label: "Find the blocker",
    question: "What needs attention before the next decision?",
    body: "Gate issues and findings identify what must be resolved before the run advances.",
    evidence: "Server-evaluated gate result · finding severity · issue reason",
  },
  {
    index: "02",
    label: "Protect the decision",
    question: "Am I approving what was actually reviewed?",
    body: "Approval requires the reviewed revision to match the current calculation.",
    evidence: "reviewedRevision = calcRevision",
  },
  {
    index: "03",
    label: "Control the release",
    question: "Which payment lines can proceed?",
    body: "Release preview identifies eligible lines and explains every exclusion.",
    evidence: "Line eligibility · exclusion reason · payment state",
  },
] as const;

export interface Assurance {
  readonly label: string;
  readonly body: string;
}

export interface AuthorityStage {
  readonly index: string;
  readonly label: string;
  readonly body: string;
}

/**
 * Plain-language stages. The implementation enum is exposed once, in
 * `PACK_STATUSES`, as supporting evidence — a buyer should not have to learn
 * what SOURCE_CAPTURED means to understand the governance model.
 */
export const AUTHORITY_STAGES: readonly AuthorityStage[] = [
  {
    index: "01",
    label: "Source",
    body: "The instrument and its evidence are recorded",
  },
  {
    index: "02",
    label: "Verify",
    body: "A human reads the provision and confirms the values against it",
  },
  {
    index: "03",
    label: "Approve",
    body: "Someone takes named responsibility, with a content hash",
  },
  {
    index: "04",
    label: "Apply",
    body: "Selected by payroll date, never by recency",
  },
  {
    index: "05",
    label: "Preserve",
    body: "Prior versions stay resolvable for historical runs",
  },
] as const;

export const AUTHORITY_STATEMENT =
  "Rules are sourced and approved before use, selected by payroll date, and preserved after replacement so historical calculations retain their authority identity.";

export const AUTHORITY_CLAIMS: readonly Assurance[] = [
  {
    label: "Effective does not mean newest",
    body: "It means applicable to the date. A 2025 run stays governed by the 2025 pack after a 2026 pack supersedes it. Two approved packs covering one date is reported as a governance conflict, not resolved by picking one.",
  },
  {
    label: "Approval is not applicability",
    body: "Both conditions are required, independently. A pack approved in December 2026 that takes effect on 1 January 2027 cannot govern a December 2026 payroll.",
  },
] as const;

export interface PackStatus {
  readonly label: string;
  readonly resolvable: boolean;
}

/** `rulePackStatus`, with the resolver's admitted set marked. */
export const PACK_STATUSES: readonly PackStatus[] = [
  { label: "DRAFT", resolvable: false },
  { label: "SOURCE_CAPTURED", resolvable: false },
  { label: "VERIFIED", resolvable: false },
  { label: "APPROVED", resolvable: true },
  { label: "EFFECTIVE", resolvable: true },
  { label: "SUPERSEDED", resolvable: true },
] as const;

export const PACK_STATUS_NOTE =
  "Struck states are excluded from payroll unconditionally — nothing short of approval may reach a run, however recent or plausible. The three admitted states include SUPERSEDED deliberately: a pack that was approved when a period was calculated must still resolve for that period after a successor replaces it.";

/**
 * `runStatus` and `GateKind`, as implemented. PAID is deliberately absent from
 * the run: payment state is a line-level rollup, so the page must never imply a
 * run is "paid".
 */
export const RUN_FLOW: readonly (
  | { readonly kind: "status"; readonly label: string }
  | { readonly kind: "gate"; readonly label: string }
)[] = [
  { kind: "status", label: "DRAFT" },
  { kind: "gate", label: "Review" },
  { kind: "status", label: "REVIEWED" },
  { kind: "gate", label: "Approval" },
  { kind: "status", label: "APPROVED" },
  { kind: "gate", label: "Release" },
  { kind: "gate", label: "Close" },
  { kind: "status", label: "CLOSED" },
] as const;

export interface GateCondition {
  readonly title: string;
  readonly body: string;
  readonly rule: string | null;
}

/** Verbatim behaviour of `evaluateGate`. */
export const GATE_CONDITIONS: readonly GateCondition[] = [
  {
    title: "Findings must match the current calculation",
    body: "Recalculate a run and its scan goes stale, so every gate fails until it is rescanned.",
    rule: "findingsScannedRevision = calcRevision",
  },
  {
    title: "What is approved must be what was reviewed",
    body: "Approval is refused if the calculation moved after review.",
    rule: "reviewedRevision = calcRevision",
  },
  {
    title: "Inputs must be present before review",
    body: "Non-zero base rate; paid days for monthly and daily; hours for hourly. Named per line, not as a run-level failure.",
    rule: null,
  },
  {
    title: "Review and Approval are revision-bound",
    body: "Their certifications record the calculation revision, statutory pack, anomaly pack version and actor.",
    rule: null,
  },
] as const;

export interface Severity {
  readonly label: string;
  readonly effect: string;
  readonly blocking: boolean;
}

export const SEVERITIES: readonly Severity[] = [
  { label: "BLOCKING", effect: "Stops the gate", blocking: true },
  { label: "WARNING", effect: "Acknowledgement required", blocking: false },
  { label: "REVIEW", effect: "Acknowledgement required", blocking: false },
  { label: "INFO", effect: "Never blocks", blocking: false },
] as const;

export const RELEASE_STATEMENT =
  "Every decision is evaluated server-side. Approval remains bound to the reviewed calculation, while release preview evaluates payment lines before a batch is created.";

/**
 * Secondary by intent. Both sentences are implementation-specific, and the
 * golden master is named here — as a build gate, which is what it is — rather
 * than in primary copy where it would read as a runtime control.
 */
export const RELEASE_EVIDENCE: readonly string[] = [
  "Those invariants are held by database triggers and check constraints rather than application code, so they hold regardless of which client writes.",
  "A run records the pack id, its content hash and the calculation engine version, so its authority identity does not depend on resolving whatever is current later.",
  "A pack used by an approved calculation is never edited in place: a correction is a new version, separately sourced, verified and approved.",
  "In the build, a golden master of thirty-seven verified employees pins the engine to the sen. A failure there stops the build, not a payroll run.",
] as const;

export interface DiffRow {
  readonly label: string;
  readonly beforeSen: number;
  readonly afterSen: number;
  readonly authority: string;
}

/**
 * The same employee-month recalculated across the 1 June 2026 boundary, which
 * is a real effective-dated change rather than an invented pack: employee-borne
 * SKBBK begins with Phase 1. Every other branch is unchanged, and unchanged
 * rows stay on the page — silence is evidence, not something to hide.
 */
export const DIFF_ROWS: readonly DiffRow[] = LEDGER_EMPLOYEE.map((row) => ({
  label: row.label,
  beforeSen: row.root === "socsoEeSkbbk" ? 0 : row.sen,
  afterSen: row.sen,
  authority: `${row.ref} · ${row.issuer}`,
}));

export const ILLUSTRATIVE_DIFF_NOTE =
  "Illustrative effective-date comparison using governed values from the named rule pack. The current product compares linked runs; this example demonstrates how unchanged and changed rows remain visible.";

export interface Report {
  readonly title: string;
  readonly purpose: string;
}

/**
 * The four reports that exist in `src/web/reports/`. Not described as
 * submission artifacts: they are implemented reports, and no claim is made that
 * their format is accepted by a bank, KWSP, PERKESO or HASiL.
 */
export const REPORTS: readonly Report[] = [
  { title: "Payment Register", purpose: "Net pay instructions for the run" },
  { title: "Statutory Summary", purpose: "Contributions by statutory body" },
  {
    title: "Exception Report",
    purpose: "Figures requiring attention before release",
  },
  {
    title: "Annual Remuneration Summary",
    purpose: "Per-employee annual remuneration",
  },
] as const;

export const CLOSING = {
  headline: "Payroll does not move until the controls clear.",
  chain: ["Findings", "Revision", "Approval", "Release preview"],
  secondary:
    "Findings identify what needs attention. Revision checks protect what was reviewed. Release preview shows which payment lines can proceed.",
} as const;

export const FOOTER_NOTE =
  "Clarity computes Malaysian statutory payroll from cited, effective-dated rule packs. It is not a substitute for professional advice, it does not transmit filings to any authority, and figures shown on this page illustrate one employee-month under the pack named above.";

export const NAV_LINKS: readonly {
  readonly href: string;
  readonly label: string;
}[] = [
  { href: "#control", label: "Control" },
  { href: "#asks", label: "Asks" },
  { href: "#failure", label: "Failure" },
  { href: "#proof", label: "Proof" },
  { href: "#authority", label: "Authority" },
  { href: "#next", label: "Next" },
] as const;
