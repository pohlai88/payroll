/**
 * Marketing copy and figures.
 *
 * Every statutory number below is read from the shipped rule pack
 * (db/seed/rule-pack-meta.json, epf-part-a.json, socso-skbbk.json, eis.json)
 * rather than invented, and money is held as integer sen and formatted once —
 * the same discipline the engine itself enforces.
 */

const SEN_PER_RINGGIT = 100;

const ringgitFormat = new Intl.NumberFormat("en-MY", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Sen in, display string out. The only money formatter on this surface. */
export function formatSen(sen: number): string {
  return ringgitFormat.format(sen / SEN_PER_RINGGIT);
}

export const RULE_PACK = {
  id: "MY-STATUTORY-2026-06",
  effectiveFrom: "1 June 2026",
  summary: "EPF Oct 2025 · SOCSO + SKBBK Jun 2026 · EIS Oct 2024",
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

export interface LedgerRow {
  readonly root: string;
  readonly label: string;
  readonly sen: number;
  readonly ref: string;
  readonly note: string;
}

export const LEDGER_GROSS_SEN = 650_000;

/**
 * One month for one employee, Part A, category 1, under 60.
 * Figures are the exact band values the shipped rule pack returns for a
 * RM6,500.00 monthly wage. PCB is illustrative — see PCB_NOTE.
 */
export const LEDGER_EMPLOYEE: readonly LedgerRow[] = [
  {
    root: "epfEe",
    label: "EPF employee",
    sen: 71_500,
    ref: "S1",
    note: "Third Schedule Part A, band 6,400.01–6,500.00",
  },
  {
    root: "socsoEeCore",
    label: "SOCSO employee",
    sen: 2975,
    ref: "S2",
    note: "Act 4 first category, above the RM6,000 ceiling",
  },
  {
    root: "socsoEeSkbbk",
    label: "SKBBK employee",
    sen: 4465,
    ref: "S2A",
    note: "Employee-borne during Phase 1, Jun 2026 – May 2028",
  },
  {
    root: "eisEe",
    label: "EIS employee",
    sen: 1190,
    ref: "S3",
    note: "Act 800, capped at the RM6,000 ceiling",
  },
  {
    root: "pcbNet",
    label: "PCB",
    sen: 31_250,
    ref: "S4",
    note: "Entered from e-PCB and verified — never derived here",
  },
] as const;

export const LEDGER_EMPLOYER: readonly LedgerRow[] = [
  {
    root: "epfEr",
    label: "EPF employer",
    sen: 78_000,
    ref: "S1",
    note: "12% above the RM5,000 employer threshold",
  },
  {
    root: "socsoEr",
    label: "SOCSO employer",
    sen: 10_415,
    ref: "S2",
    note: "Act 4 first category, ceiling band",
  },
  {
    root: "eisEr",
    label: "EIS employer",
    sen: 1190,
    ref: "S3",
    note: "Act 800, ceiling band",
  },
] as const;

export const PCB_NOTE =
  "Clarity never computes PCB. It is entered from an approved LHDN method, carried as an externally verified node, and if it is absent your net pay renders as unknown — not as zero.";

export interface Capability {
  readonly id: string;
  readonly index: string;
  readonly title: string;
  readonly body: string;
}

export const CAPABILITIES: readonly Capability[] = [
  {
    id: "sen",
    index: "01",
    title: "Integer sen, end to end",
    body: "No floating point touches money. Rounding happens in exactly one function, half away from zero, and a value that cannot be represented in sen raises rather than quietly losing a cent.",
  },
  {
    id: "golden",
    index: "02",
    title: "A golden master that can fail",
    body: "Thirty-seven real employees, every statutory figure asserted to the sen. When it fails, the engine changed behaviour and the build stops. The fixture is never edited to match the code.",
  },
  {
    id: "graph",
    index: "03",
    title: "Every figure is a graph",
    body: "Alongside the arithmetic the engine emits a derivation DAG of eleven node kinds. A separate mirror test proves the two agree across all nineteen roots before anything is stored.",
  },
  {
    id: "packs",
    index: "04",
    title: "A rate is never a literal",
    body: "Every table lives in a versioned pack carrying its issuer, URL, retrieval date and SHA-256. A figure computed in 2026 can still be re-explained in 2031, against the pack that produced it.",
  },
  {
    id: "invariants",
    index: "05",
    title: "Invariants in the database",
    body: "Eighteen tables whose rules are held by plpgsql triggers rather than application code, so they hold no matter which client writes. Approval locks the calculation.",
  },
  {
    id: "bilingual",
    index: "06",
    title: "No prose stored beside a figure",
    body: "Nodes carry a message key and typed parameters, never a sentence. One graph renders in English and Malay without the words ever drifting away from the numbers.",
  },
] as const;

export interface NodeKind {
  readonly id: string;
  readonly label: string;
  readonly answers: string;
}

/** The eleven node kinds a drill-down can land on. */
export const NODE_KINDS: readonly NodeKind[] = [
  { id: "input", label: "INPUT", answers: "who entered it, when, which batch" },
  {
    id: "setting",
    label: "SETTING",
    answers: "the raw value, verbatim, and its citation",
  },
  {
    id: "classification",
    label: "CLASSIFICATION",
    answers: "which rule chose this category",
  },
  {
    id: "table",
    label: "TABLE_LOOKUP",
    answers: "the matched row, and the bands either side",
  },
  {
    id: "calculation",
    label: "CALCULATION",
    answers: "the operator and its operands",
  },
  {
    id: "rounding",
    label: "ROUNDING",
    answers: "the pre-rounded value and the delta",
  },
  {
    id: "proration",
    label: "PRORATION",
    answers: "the basis, and the Employment Act citation",
  },
  {
    id: "external",
    label: "EXTERNAL_VERIFIED",
    answers: "the source and the evidence reference",
  },
  {
    id: "override",
    label: "MANUAL_OVERRIDE",
    answers: "computed and applied, side by side",
  },
  {
    id: "aggregate",
    label: "AGGREGATE",
    answers: "members — and what was excluded, and why",
  },
  {
    id: "na",
    label: "NOT_APPLICABLE",
    answers: "a zero that carries a citation",
  },
] as const;

/** The complete numeric vocabulary of the product. Nothing else is displayable. */
export const ROOTS: readonly string[] = [
  "gross",
  "epfWages",
  "socsoWages",
  "eisWages",
  "epfEe",
  "epfEr",
  "socsoEeCore",
  "socsoEeSkbbk",
  "socsoEr",
  "eisEe",
  "eisEr",
  "pcbNet",
  "cp38",
  "zakat",
  "otherDeductions",
  "deductionsTotal",
  "net",
  "hrdfLevy",
  "employerCost",
] as const;
