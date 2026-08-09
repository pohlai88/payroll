import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AUTHORITY_CLAIMS,
  AUTHORITY_STAGES,
  AUTHORITY_STATEMENT,
  formatIsoDate,
  PACK_STATUS_NOTE,
  PACK_STATUSES,
  SOURCES,
} from "@/marketing/content";
import { EvidenceDisclosure } from "@/marketing/evidence-disclosure";
import { SectionIntro } from "@/marketing/section-intro";

export function AuthorityEvidence() {
  return (
    <section className="section-space bg-ground" id="authority">
      <div className="page-shell">
        <SectionIntro
          align="split"
          body="Governance supports the operator decision. The public model stays simple; exact source records and internal statuses remain available as evidence below."
          eyebrow="Authority lifecycle"
          title="The applicable rule is governed before it reaches payroll."
        />

        <ol className="panel-cut-lg grid border border-hair bg-ground-2 md:grid-cols-5">
          {AUTHORITY_STAGES.map((stage, index) => (
            <li
              className="relative border-hair px-5 py-7 md:border-r md:last:border-r-0"
              key={stage.label}
            >
              <span
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-full border border-teal/30 bg-mint-fill font-mono text-teal text-xs"
              >
                {stage.index}
              </span>
              <h3 className="mt-4 font-sans font-semibold text-navy text-xl">
                {stage.label}
              </h3>
              <p className="mt-2 text-meta text-sm leading-relaxed">
                {stage.body}
              </p>
              {index < AUTHORITY_STAGES.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 -right-2 z-10 hidden size-4 rounded-full border-2 border-teal bg-ground md:block"
                />
              ) : null}
            </li>
          ))}
        </ol>

        <p className="mt-12 max-w-[58ch] font-display font-medium text-[clamp(1.75rem,3.2vw,2.75rem)] text-navy leading-[1.16] tracking-[-0.035em]">
          {AUTHORITY_STATEMENT}
        </p>

        <dl className="mt-12 grid gap-10 border-hair border-t pt-10 md:grid-cols-2">
          {AUTHORITY_CLAIMS.map((claim) => (
            <div className="border-teal/20 border-l-2 pl-5" key={claim.label}>
              <dt className="font-semibold text-lg text-navy">{claim.label}</dt>
              <dd className="mt-3 text-base text-meta leading-[1.7]">
                {claim.body}
              </dd>
            </div>
          ))}
        </dl>

        <Separator className="my-12 bg-hair" />

        <div>
          <EvidenceDisclosure
            id="source-records"
            label="Source records and evidence"
            summary="Eight cited instruments with issuer, retrieval date and evidence status."
          >
            <div className="overflow-x-auto rounded-md border border-hair">
              <table className="w-full min-w-[48rem] border-collapse text-left">
                <caption className="sr-only">
                  Statutory instruments cited by the illustrative rule pack
                </caption>
                <thead className="bg-navy text-white">
                  <tr>
                    {[
                      "Ref",
                      "Issuer",
                      "Instrument",
                      "Retrieved",
                      "Evidence",
                    ].map((heading) => (
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
                  {SOURCES.map((source) => (
                    <tr className="border-hair border-t" key={source.ref}>
                      <th
                        className="px-4 py-4 font-mono font-normal text-sm text-teal"
                        scope="row"
                        translate="no"
                      >
                        {source.ref}
                      </th>
                      <td
                        className="px-4 py-4 text-navy text-sm"
                        translate="no"
                      >
                        {source.issuer}
                      </td>
                      <td className="px-4 py-4 text-slate text-sm">
                        {source.title}
                      </td>
                      <td className="px-4 py-4 font-mono text-meta text-xs">
                        <time dateTime={source.retrievedAt}>
                          {formatIsoDate(source.retrievedAt)}
                        </time>
                      </td>
                      <td className="px-4 py-4 font-mono text-meta text-xs">
                        {source.digest ?? "method ref · no digest"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </EvidenceDisclosure>

          <EvidenceDisclosure
            id="pack-statuses"
            label="Implementation statuses"
            summary="The exact internal lifecycle and the statuses the resolver admits for the applicable payroll date."
          >
            <ol className="flex flex-wrap items-center gap-2">
              {PACK_STATUSES.map((status) => (
                <li key={status.label}>
                  <Badge
                    className={`rounded-md px-3 py-1.5 font-mono text-xs tracking-[0.06em] ${
                      status.resolvable
                        ? "border-mint-line bg-mint-fill text-mint-ink"
                        : "border-hair bg-ground-2 text-meta line-through"
                    }`}
                    translate="no"
                    variant="outline"
                  >
                    {status.resolvable ? (
                      <span
                        aria-hidden="true"
                        className="size-1.5 rounded-full bg-mint-ink"
                      />
                    ) : null}
                    {status.label}
                  </Badge>
                </li>
              ))}
            </ol>
            <p className="mt-5 max-w-[76ch] text-meta text-sm leading-[1.7]">
              {PACK_STATUS_NOTE}
            </p>
          </EvidenceDisclosure>
        </div>
      </div>
    </section>
  );
}
