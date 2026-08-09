import { Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  formatRinggit,
  LEDGER_EMPLOYEE,
  LEDGER_GROSS_SEN,
  LEDGER_NET_SEN,
  type LedgerRow,
  PCB_NOTE,
  RULE_PACK,
  SCENARIO,
} from "@/marketing/content";
import { SectionIntro } from "@/marketing/section-intro";

const DEDUCTIONS_SEN = LEDGER_EMPLOYEE.reduce(
  (total, row) => total + row.sen,
  0
);

const RECONCILIATION = `${LEDGER_GROSS_SEN.toLocaleString("en-MY")} − (${LEDGER_EMPLOYEE.map(
  (row) => row.sen.toLocaleString("en-MY")
).join(
  " + "
)}) = ${(LEDGER_GROSS_SEN - DEDUCTIONS_SEN).toLocaleString("en-MY")} sen`;

function rowTone(row: LedgerRow): string {
  if (row.kind === "EXTERNAL_VERIFIED") {
    return "border-teal border-dashed bg-ground";
  }
  if (row.ceilingBinds) {
    return "border-amber-line bg-amber-fill";
  }
  return "border-hair bg-ground";
}

function signalBadge(row: LedgerRow) {
  if (row.kind === "EXTERNAL_VERIFIED") {
    return (
      <Badge
        className="rounded-md border-teal/35 bg-transparent px-2 py-0 font-medium text-teal text-xs"
        variant="outline"
      >
        External verified
      </Badge>
    );
  }
  if (row.ceilingBinds) {
    return (
      <Badge className="rounded-md border-amber-line/50 bg-amber-fill px-2 py-0 font-semibold text-amber-ink text-xs">
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-amber-ink"
        />
        Ceiling binds
      </Badge>
    );
  }
  if (row.participation !== null) {
    return (
      <Badge className="rounded-md border-mint-line bg-mint-fill px-2 py-0 font-medium text-mint-ink text-xs">
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-mint-ink"
        />
        {row.participation}
      </Badge>
    );
  }
  return null;
}

export function ProofLedger() {
  return (
    <section
      className="section-space border-hair border-t bg-ground-2"
      id="proof"
    >
      <div className="page-shell">
        <SectionIntro
          align="split"
          body="A governed illustration, not customer data. The arithmetic reconciles to the sen and every deduction names the source record behind the example."
          eyebrow="One governed employee-month"
          title="The result, the deduction, and the authority stay together."
        />

        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <div className="panel-cut border border-teal/25 bg-mint-fill/40 p-6">
              <p className="rubric text-teal">Illustrative employee-month</p>
              <dl className="mt-6 grid gap-y-4">
                <div>
                  <dt className="text-meta text-sm">Employee</dt>
                  <dd className="mt-1 text-base text-navy">
                    {SCENARIO.employee}
                  </dd>
                </div>
                <div>
                  <dt className="text-meta text-sm">LINDUNG 24 JAM</dt>
                  <dd className="mt-1">
                    <Badge className="rounded-md border-mint-line bg-mint-fill px-2.5 py-0.5 font-semibold text-mint-ink text-xs">
                      <span
                        aria-hidden="true"
                        className="size-1.5 rounded-full bg-mint-ink"
                      />
                      {SCENARIO.participation}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-meta text-sm">Calculation date</dt>
                  <dd className="mt-1 font-mono text-navy text-sm">
                    <time dateTime={SCENARIO.calculationDateIso}>
                      {SCENARIO.calculationDate}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt className="text-meta text-sm">Rule pack</dt>
                  <dd className="mt-1 font-mono text-navy text-sm">
                    <span translate="no">{RULE_PACK.id}</span>
                    <span className="block text-meta">
                      Effective{" "}
                      <time dateTime={RULE_PACK.effectiveFromIso}>
                        {RULE_PACK.effectiveFrom}
                      </time>
                    </span>
                  </dd>
                </div>
              </dl>
            </div>

            <dl className="mt-8 border-hair border-y">
              <div className="flex items-baseline justify-between gap-6 border-hair border-b py-5">
                <dt className="text-meta text-sm">Gross pay</dt>
                <dd className="figure-nums font-medium font-mono text-lg text-navy">
                  {formatRinggit(LEDGER_GROSS_SEN)}
                </dd>
              </div>
              <div className="py-6">
                <dt className="rubric text-teal">Net pay</dt>
                <dd className="figure-nums mt-2 font-display font-semibold text-[clamp(2.5rem,5vw,4rem)] text-navy leading-none tracking-[-0.045em]">
                  {formatRinggit(LEDGER_NET_SEN)}
                </dd>
              </div>
            </dl>

            <p className="mt-5 font-mono text-meta text-xs leading-relaxed">
              Reconciliation · {RECONCILIATION}
            </p>
          </div>

          <div className="lg:col-span-7">
            <ol className="grid gap-3">
              {LEDGER_EMPLOYEE.map((row) => (
                <li
                  className={`panel-cut grid gap-4 border px-5 py-5 sm:grid-cols-[1fr_auto] sm:items-start ${rowTone(
                    row
                  )}`}
                  key={row.root}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <h3
                        className="font-sans font-semibold text-base text-navy"
                        translate="no"
                      >
                        {row.label}
                      </h3>
                      {signalBadge(row)}
                    </div>
                    <p
                      className="mt-2 font-mono text-teal text-xs"
                      translate="no"
                    >
                      {row.ref} · {row.issuer}
                    </p>
                    <p className="mt-2 max-w-[54ch] text-meta text-sm leading-relaxed">
                      {row.note}
                    </p>
                  </div>
                  <data
                    className="figure-nums font-medium font-mono text-lg text-navy"
                    value={row.sen}
                  >
                    −{"\u00A0"}
                    {formatRinggit(row.sen)}
                  </data>
                </li>
              ))}
            </ol>

            <Alert className="mt-8 rounded-md border-blue-line bg-blue-fill px-5 py-4 text-blue-ink [&>svg]:text-blue-ink">
              <Info aria-hidden="true" />
              <AlertTitle className="rubric text-blue-ink">
                Why PCB is different
              </AlertTitle>
              <AlertDescription className="mt-2 text-blue-ink/85 text-sm leading-[1.7] md:text-pretty">
                {PCB_NOTE}
              </AlertDescription>
            </Alert>
          </div>
        </div>
      </div>
    </section>
  );
}
