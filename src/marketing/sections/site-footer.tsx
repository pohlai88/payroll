/**
 * @feature marketing
 * @layer ui
 *
 * Marketing landing surface.
 */

import { Separator } from "@/components/ui/separator";
import { FOOTER_NOTE, RULE_PACK } from "@/marketing/content";

export function SiteFooter() {
  return (
    <footer className="border-hair border-t bg-ground">
      <div className="page-shell py-12">
        <div className="grid gap-8 md:grid-cols-[auto_1fr] md:items-start">
          <div>
            <p
              className="font-display font-semibold text-lg text-navy tracking-[-0.04em]"
              translate="no"
            >
              Clarity
            </p>
            <p className="mt-3 font-mono text-meta text-xs leading-relaxed">
              <span translate="no">{RULE_PACK.id}</span>
              <br />
              effective{" "}
              <time dateTime={RULE_PACK.effectiveFromIso}>
                {RULE_PACK.effectiveFrom}
              </time>
              <br />
              <span translate="no">{RULE_PACK.summary}</span>
            </p>
          </div>
          <p className="max-w-[72ch] text-meta text-sm leading-[1.7] md:justify-self-end">
            {FOOTER_NOTE}
          </p>
        </div>
        <Separator className="my-8 bg-hair" />
        <p className="font-mono text-meta text-xs tracking-[0.08em]">
          Clarity Payroll · governed illustration
        </p>
      </div>
    </footer>
  );
}
