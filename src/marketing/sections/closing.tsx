/**
 * @feature marketing
 * @layer ui
 *
 * Marketing landing surface.
 */

import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CLOSING } from "@/marketing/content";
import { CtaLink } from "@/marketing/cta-link";

/**
 * Inspired by studio cta-section-07 / 10: split message + dual actions with a
 * concrete checklist. No stock imagery, email capture, or motion package —
 * the chain is the product's own Findings → Release preview sequence.
 */
export function Closing() {
  return (
    <section className="relative isolate overflow-hidden bg-navy">
      <span
        aria-hidden="true"
        className="pattern-grid absolute inset-0 opacity-70"
      />
      <span
        aria-hidden="true"
        className="glow absolute -right-24 -bottom-32 size-[28rem] rounded-full opacity-60"
      />
      <div className="page-shell section-space relative">
        <div className="panel-cut-lg border border-white/10 bg-white/[0.03] p-8 sm:p-12 lg:p-14">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-end lg:gap-16">
            <div className="lg:col-span-7">
              <Badge
                className="rounded-md border-teal-lift/40 bg-white/5 px-3 py-1 font-normal text-sm text-teal-lift"
                variant="outline"
              >
                Next step
              </Badge>
              <h2 className="mt-6 max-w-[22ch] font-display font-semibold text-[clamp(2.25rem,5vw,3.75rem)] text-white leading-[1.04] tracking-[-0.045em]">
                {CLOSING.headline}
              </h2>
              <p className="mt-6 max-w-[58ch] text-lg text-white/65 leading-[1.7]">
                {CLOSING.secondary}
              </p>
            </div>

            <div className="flex flex-col gap-8 lg:col-span-5">
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {CLOSING.chain.map((step) => (
                  <li className="flex items-center gap-3" key={step}>
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-teal-lift/20 text-teal-lift">
                      <Check aria-hidden="true" className="size-3.5" />
                    </span>
                    <span className="font-medium text-sm text-white/85">
                      {step}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-3">
                <CtaLink href="/" tone="inverse">
                  Open the app
                </CtaLink>
                <CtaLink href="#asks" tone="ghost">
                  See how controls work
                </CtaLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
