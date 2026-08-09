import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DECISION_CONTROLS,
  HERO,
  RULE_PACK,
  RUN_FLOW,
} from "@/marketing/content";
import { CtaLink } from "@/marketing/cta-link";

/**
 * Inspired by studio hero-section-24/25 layout DNA (split message + companion,
 * soft badge, dual CTAs, trust strip) without floating widgets, fake metrics,
 * or marquee logos. The companion remains a static evaluated-run rail.
 */
export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-navy text-white">
      <span
        aria-hidden="true"
        className="glow absolute -top-56 -right-36 size-[38rem] rounded-full opacity-70"
      />
      <span
        aria-hidden="true"
        className="pattern-grid absolute inset-0 opacity-70"
      />
      <div className="page-shell relative grid min-h-[44rem] items-center gap-14 py-20 lg:grid-cols-12 lg:gap-16 lg:py-28">
        <div className="flex flex-col justify-center lg:col-span-7">
          <Badge
            className="rise w-fit rounded-md border-teal-lift/40 bg-white/5 px-3 py-1 font-normal text-sm text-teal-lift"
            style={{ animationDelay: "0ms" }}
            variant="outline"
          >
            {HERO.eyebrow}
          </Badge>
          <h1
            className="rise mt-6 max-w-[14ch] font-display font-semibold text-[clamp(2.75rem,6vw,4.5rem)] leading-[0.99] tracking-[-0.05em]"
            style={{ animationDelay: "80ms" }}
          >
            {HERO.title}
          </h1>
          <p
            className="rise mt-6 max-w-[54ch] text-lg text-white/70 leading-[1.7] md:text-xl"
            style={{ animationDelay: "160ms" }}
          >
            {HERO.body}
          </p>
          <div
            className="rise mt-9 flex flex-wrap items-center gap-3"
            style={{ animationDelay: "240ms" }}
          >
            <CtaLink href="/" tone="inverse">
              Open the app
            </CtaLink>
            <CtaLink href="#control" tone="ghost">
              See how control works
            </CtaLink>
          </div>

          <div
            className="rise mt-14 max-w-xl"
            style={{ animationDelay: "320ms" }}
          >
            <p className="text-sm text-white/45">
              Supported before the next decision
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-3">
              {DECISION_CONTROLS.map((control) => (
                <li
                  className="border-white/12 border-t pt-3"
                  key={control.label}
                >
                  <p className="font-medium text-sm text-white/85">
                    {control.label}
                  </p>
                  <p className="mt-1 text-white/45 text-xs leading-relaxed">
                    {control.evidence.split(" · ")[0]}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-6 font-mono text-white/45 text-xs">
              <span translate="no">{RULE_PACK.id}</span> · effective{" "}
              <time dateTime={RULE_PACK.effectiveFromIso}>
                {RULE_PACK.effectiveFrom}
              </time>
            </p>
          </div>
        </div>

        <div
          className="rise panel-cut-lg relative border border-white/14 bg-white/[0.05] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm lg:col-span-5 lg:p-8"
          style={{ animationDelay: "200ms" }}
        >
          <div className="flex items-center justify-between gap-4">
            <p className="rubric text-teal-lift">Run decision path</p>
            <Badge className="rounded-md border-teal-lift/30 bg-teal-lift/10 px-2.5 py-0.5 font-mono font-normal text-teal-lift text-xs tracking-[0.08em]">
              Evaluated
            </Badge>
          </div>
          <Separator className="my-6 bg-white/12" />
          <ol>
            {RUN_FLOW.map((step, index) => (
              <li
                className="relative grid grid-cols-[1.5rem_1fr] gap-4 pb-5 last:pb-0"
                key={`${step.kind}-${step.label}`}
              >
                {index < RUN_FLOW.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-4 bottom-0 left-[0.45rem] w-px bg-white/18"
                  />
                ) : null}
                <span
                  aria-hidden="true"
                  className={`relative mt-1 block size-3.5 rounded-full border-2 ${
                    step.kind === "status"
                      ? "border-teal-lift bg-teal-lift shadow-[0_0_0_4px_rgba(118,188,174,0.18)]"
                      : "border-white/45 bg-navy"
                  }`}
                />
                <div className="border-white/10 border-b pb-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p
                      className={
                        step.kind === "status"
                          ? "font-mono text-white text-xs tracking-[0.08em]"
                          : "font-semibold text-base text-white"
                      }
                      translate={step.kind === "status" ? "no" : undefined}
                    >
                      {step.label}
                    </p>
                    {step.kind === "gate" ? (
                      <Badge className="rounded-sm border-white/20 bg-transparent px-1.5 py-0 font-medium text-white/55 text-xs uppercase tracking-[0.08em]">
                        Gate
                      </Badge>
                    ) : null}
                  </div>
                  {step.kind === "gate" ? (
                    <p className="mt-1 text-sm text-white/55">
                      Evaluated before the run or payment lines advance
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-white/55 leading-relaxed">
            Review and Approval record revision-bound certifications. Release
            and Close evaluate their applicable gate and checklist conditions.
          </p>
        </div>
      </div>
    </section>
  );
}
