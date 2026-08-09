import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DIFF_ROWS,
  formatRinggit,
  formatSen,
  GATE_CONDITIONS,
  ILLUSTRATIVE_DIFF_NOTE,
  RELEASE_STATEMENT,
  REPORTS,
  SEVERITIES,
  type Severity,
} from "@/marketing/content";
import { SectionIntro } from "@/marketing/section-intro";

function severityTone(severity: Severity): string {
  if (severity.blocking) {
    return "border-amber-line bg-amber-fill text-amber-ink";
  }
  if (severity.effect === "Never blocks") {
    return "border-hair bg-ground text-meta";
  }
  return "border-blue-line bg-blue-fill text-blue-ink";
}

export function RunEvidence() {
  return (
    <section
      className="section-space relative border-hair border-t bg-ground-2"
      id="next"
    >
      <span
        aria-hidden="true"
        className="pattern-grid-light pointer-events-none absolute inset-0 opacity-40"
      />
      <div className="page-shell relative">
        <SectionIntro
          align="split"
          body="Gate evaluation, an illustrative effective-date comparison, and implemented reports share one purpose: give the operator enough evidence to make the next payroll decision deliberately."
          eyebrow="Run control and outputs"
          title="Every decision evaluated server-side."
        />

        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <dl className="grid gap-4 sm:grid-cols-2">
              {GATE_CONDITIONS.map((condition) => (
                <div
                  className="panel-cut border border-hair bg-ground px-5 py-5"
                  key={condition.title}
                >
                  <dt className="font-semibold text-base text-navy">
                    {condition.title}
                  </dt>
                  <dd className="mt-2 text-meta text-sm leading-[1.7]">
                    {condition.body}
                    {condition.rule === null ? null : (
                      <code className="mt-3 block font-mono text-teal text-xs">
                        {condition.rule}
                      </code>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="lg:col-span-5">
            <div className="panel-cut-lg border border-teal/25 bg-mint-fill/50 p-6">
              <p className="text-lg text-slate leading-[1.7]">
                {RELEASE_STATEMENT}
              </p>
              <p className="mt-6 text-meta text-sm leading-[1.7]">
                Review and Approval record revision-bound certifications.
                Release and Close evaluate their applicable gate and checklist
                conditions.
              </p>
            </div>
          </div>
        </div>

        <dl className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SEVERITIES.map((severity) => (
            <div
              className={`panel-cut border px-4 py-4 ${severityTone(severity)}`}
              key={severity.label}
            >
              <dt className="flex items-center gap-2" translate="no">
                <Badge
                  className={`rounded-md px-2 py-0 font-mono text-xs tracking-[0.08em] ${severityTone(
                    severity
                  )}`}
                >
                  <span
                    aria-hidden="true"
                    className={`size-1.5 rounded-full ${
                      severity.blocking ? "bg-amber-ink" : "bg-current"
                    }`}
                  />
                  {severity.label}
                </Badge>
              </dt>
              <dd className="mt-3 text-sm">{severity.effect}</dd>
            </div>
          ))}
        </dl>

        <Separator className="my-16 bg-hair" />

        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className="rubric text-teal">
              Illustrative effective-date comparison
            </p>
            <h3 className="mt-4 max-w-[18ch] font-display font-semibold text-3xl text-navy leading-tight tracking-[-0.035em]">
              Changed and unchanged rows stay visible.
            </h3>
            <p className="mt-5 text-base text-meta leading-[1.7]">
              {ILLUSTRATIVE_DIFF_NOTE}
            </p>
          </div>
          <div className="overflow-x-auto rounded-md border border-hair bg-ground lg:col-span-8">
            <table className="w-full min-w-[38rem] border-collapse text-left">
              <caption className="sr-only">
                Illustrative employee deduction values before and after the
                named effective date
              </caption>
              <thead className="bg-navy text-white">
                <tr>
                  {["Figure", "Before", "After", "Delta"].map((heading) => (
                    <th
                      className="px-4 py-4 font-semibold text-xs uppercase tracking-[0.1em]"
                      key={heading}
                      scope="col"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DIFF_ROWS.map((row) => {
                  const delta = row.afterSen - row.beforeSen;
                  const changed = delta !== 0;
                  return (
                    <tr
                      className={`border-hair border-b ${
                        changed ? "bg-amber-fill" : ""
                      }`}
                      key={row.label}
                    >
                      <th
                        className="px-4 py-4 font-medium text-navy text-sm"
                        scope="row"
                        translate="no"
                      >
                        {row.label}
                      </th>
                      <td className="figure-nums px-4 py-4 font-mono text-meta text-sm">
                        {formatRinggit(row.beforeSen)}
                      </td>
                      <td className="figure-nums px-4 py-4 font-mono text-navy text-sm">
                        {formatRinggit(row.afterSen)}
                      </td>
                      <td
                        className={`figure-nums px-4 py-4 font-mono text-sm ${
                          changed ? "font-medium text-amber-ink" : "text-meta"
                        }`}
                      >
                        {changed ? `+${formatSen(delta)}` : "unchanged"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-20 grid gap-10 border-hair border-t pt-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className="rubric text-teal">Implemented reports</p>
            <h3 className="mt-4 font-display font-semibold text-3xl text-navy tracking-[-0.035em]">
              Evidence-ready, without a submission claim.
            </h3>
          </div>
          <dl className="lg:col-span-8">
            {REPORTS.map((report) => (
              <div
                className="panel-cut mb-3 grid gap-2 border border-hair bg-ground px-5 py-5 sm:grid-cols-[1fr_1.1fr] sm:items-center sm:gap-8"
                key={report.title}
              >
                <dt className="font-semibold text-base text-navy">
                  {report.title}
                </dt>
                <dd className="text-meta text-sm leading-relaxed">
                  {report.purpose}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
