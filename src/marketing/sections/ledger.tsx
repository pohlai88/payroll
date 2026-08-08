import {
  formatSen,
  LEDGER_EMPLOYEE,
  LEDGER_EMPLOYER,
  LEDGER_GROSS_SEN,
  type LedgerRow,
  PCB_NOTE,
} from "@/marketing/content";
import { SectionHeading } from "@/marketing/section-heading";

function sumSen(rows: readonly LedgerRow[]): number {
  let total = 0;
  for (const row of rows) {
    total += row.sen;
  }
  return total;
}

const DEDUCTIONS_SEN = sumSen(LEDGER_EMPLOYEE);
const NET_SEN = LEDGER_GROSS_SEN - DEDUCTIONS_SEN;
const EMPLOYER_SEN = sumSen(LEDGER_EMPLOYER);

function LedgerLine({ row }: { readonly row: LedgerRow }) {
  return (
    <tr className="group border-rule-hair border-b align-baseline transition-colors last:border-0 hover:bg-paper-deep/40">
      <th className="py-3.5 pr-4 text-left font-normal" scope="row">
        <span className="block text-ink text-sm md:text-base">{row.label}</span>
        <span className="mt-0.5 block font-mono text-[0.65rem] text-ink-faint">
          {row.root}
        </span>
      </th>
      <td className="hidden py-3.5 pr-4 text-ink-muted text-xs leading-relaxed sm:table-cell">
        {row.note}
      </td>
      <td className="py-3.5 pr-4 text-right">
        <span className="rubric rounded-sm border border-stamp/40 px-1.5 py-0.5 text-stamp">
          {row.ref}
        </span>
      </td>
      <td className="figure-nums py-3.5 text-right text-base md:text-lg">
        {formatSen(row.sen)}
      </td>
    </tr>
  );
}

export function Ledger() {
  return (
    <section className="border-rule border-b" id="ledger">
      <div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-28">
        <SectionHeading
          index="01"
          lede="One employee, one month, Part A, first category, under sixty. Each figure below is the exact band value the shipped rule pack returns for a RM6,500.00 monthly wage — not a rounded illustration — and each carries the reference of the document it came from."
          rubric="The ledger"
          title="A month, read the way an auditor reads it."
        />

        <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:gap-16">
          {/* Main ledger card */}
          <div className="grain rounded-sm border border-rule bg-paper-card p-6 md:p-9">
            {/* Gross header */}
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-ink border-b-2 pb-4">
              <h3 className="font-display text-2xl">Gross wage</h3>
              <p className="figure-nums font-display text-3xl md:text-4xl">
                {formatSen(LEDGER_GROSS_SEN)}
              </p>
            </div>

            {/* Employee deductions */}
            <table className="mt-8 w-full border-collapse text-left">
              <caption className="rubric mb-4 text-left text-ink-faint">
                Employee deductions
              </caption>
              <tbody>
                {LEDGER_EMPLOYEE.map((row) => (
                  <LedgerLine key={row.root} row={row} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-ink border-t">
                  <th
                    className="pt-4 text-left font-normal text-ink-muted text-sm"
                    colSpan={3}
                    scope="row"
                  >
                    Deductions total
                  </th>
                  <td className="figure-nums pt-4 text-right text-base text-ink-muted">
                    ({formatSen(DEDUCTIONS_SEN)})
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Double rule — net pay */}
            <div className="mt-8 border-ink border-t-2 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-ink border-t bg-paper-card pt-4">
                <h3 className="font-display text-2xl">Net pay</h3>
                <p className="figure-nums font-display text-3xl text-ledger md:text-4xl">
                  {formatSen(NET_SEN)}
                </p>
              </div>
            </div>

            {/* Employer contributions */}
            <table className="mt-12 w-full border-collapse text-left">
              <caption className="rubric mb-4 text-left text-ink-faint">
                Employer contributions
              </caption>
              <tbody>
                {LEDGER_EMPLOYER.map((row) => (
                  <LedgerLine key={row.root} row={row} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-ink border-t">
                  <th
                    className="pt-4 text-left font-normal text-ink-muted text-sm"
                    colSpan={3}
                    scope="row"
                  >
                    Employer contributions total
                  </th>
                  <td className="figure-nums pt-4 text-right text-base text-ink-muted">
                    {formatSen(EMPLOYER_SEN)}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Footnote bar */}
            <div className="mt-8 flex items-center gap-2 border-rule border-t pt-4">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full bg-stamp/60"
              />
              <p className="font-mono text-[0.65rem] text-ink-faint">
                Rule pack <span className="text-ink">MY-STATUTORY-2026-06</span>
                {" · "}integer sen throughout{" · "}no float arithmetic
              </p>
            </div>
          </div>

          {/* Right sidebar */}
          <aside className="flex flex-col gap-8 lg:pt-4">
            {/* PCB callout */}
            <div className="border-stamp border-l-2 pl-5">
              <p className="rubric text-stamp">On PCB</p>
              <p className="mt-4 text-ink leading-relaxed">{PCB_NOTE}</p>
            </div>

            {/* Why sen */}
            <div className="border-rule border-t pt-6">
              <p className="rubric text-ink-faint">Why sen, not ringgit</p>
              <p className="mt-4 text-ink-muted leading-relaxed">
                Every figure above is held as an integer number of sen and
                formatted once, at the edge. Floating point never touches money,
                so the total of a column is the sum of the column — not the sum
                plus a fraction of a cent that grows with your headcount.
              </p>
            </div>

            {/* Summary tile */}
            <div className="rounded-sm border border-rule bg-paper p-5">
              <p className="rubric text-ink-faint">Net pay at a glance</p>
              <dl className="mt-4 space-y-2.5">
                <div className="flex justify-between text-sm">
                  <dt className="text-ink-muted">Gross</dt>
                  <dd className="figure-nums font-mono text-ink">
                    {formatSen(LEDGER_GROSS_SEN)}
                  </dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-ink-muted">Deductions</dt>
                  <dd className="figure-nums font-mono text-stamp">
                    ({formatSen(DEDUCTIONS_SEN)})
                  </dd>
                </div>
                <div className="flex justify-between border-rule border-t pt-2.5">
                  <dt className="font-medium text-ink text-sm">Net</dt>
                  <dd className="figure-nums font-display text-ledger text-lg">
                    {formatSen(NET_SEN)}
                  </dd>
                </div>
              </dl>
            </div>

            <p className="text-ink-faint text-xs leading-relaxed">
              Illustrative employee. Statutory band values are drawn from rule
              pack MY-STATUTORY-2026-06; PCB is shown as an entered figure.
              Always verify against current official schedules before each
              payroll year.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
