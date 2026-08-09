import { CONTROL_PROOF, HERO, HERO_ASSURANCE } from "@/marketing/content";
import { CtaLink } from "@/marketing/cta-link";

/**
 * Movement 1 — Director Control Proof Hero.
 *
 * Asymmetric ~1.08fr / 0.92fr layout: left copy + CTAs, right proof board.
 * Section id="control" per the spine nav contract.
 * Primary CTA → #asks. Secondary CTA → /.
 * Amber only on Blocked state. translate="no" on the invariant.
 * Footer: three assurance chips only — no repeating footer note.
 */
export function Hero() {
  return (
    <section
      aria-label="Payroll control proof hero"
      className="relative isolate overflow-hidden bg-navy text-white"
      id="control"
    >
      {/* Top teal rule */}
      <div
        aria-hidden="true"
        className="h-1 bg-gradient-to-r from-teal to-teal-lift to-72% opacity-90 rule-draw"
      />

      <span
        aria-hidden="true"
        className="glow absolute -top-56 -right-36 size-[38rem] rounded-full opacity-60"
      />
      <span
        aria-hidden="true"
        className="pattern-grid absolute inset-0 opacity-70"
      />

      {/* Director asymmetric grid: ~1.08fr / 0.92fr */}
      <div className="page-shell relative grid min-h-[37rem] items-center gap-14 py-16 lg:grid-cols-[1.08fr_0.92fr] lg:gap-12 lg:py-[4.25rem]">
        {/* Left: eyebrow, headline, lede, CTAs */}
        <div className="flex flex-col justify-center">
          <p
            className="rise flex items-center gap-2.5 text-teal-lift rubric"
            style={{ animationDelay: "0ms" }}
          >
            <span aria-hidden="true" className="block h-px w-7 bg-teal-lift" />
            {HERO.eyebrow}
          </p>

          <h1
            className="rise mt-5 font-display font-semibold text-[clamp(2.75rem,5vw,4.625rem)] leading-[0.98] tracking-[-0.048em] text-white"
            style={{ animationDelay: "80ms" }}
          >
            {HERO.title}
          </h1>

          <p
            className="rise mt-7 max-w-[38rem] text-lg text-white/70 leading-[1.62]"
            style={{ animationDelay: "160ms" }}
          >
            Every run must clear its{" "}
            <strong className="font-semibold text-white">
              current revision checks
            </strong>{" "}
            and{" "}
            <strong className="font-semibold text-white">
              unresolved findings
            </strong>{" "}
            before it can move through review, approval or release.
          </p>

          <div
            className="rise mt-8 flex flex-wrap items-center gap-3"
            style={{ animationDelay: "240ms" }}
          >
            <CtaLink href="#asks" tone="inverse">
              See how controls work
            </CtaLink>
            <CtaLink href="/" tone="ghost">
              Open the app
            </CtaLink>
          </div>
        </div>

        {/* Right: proof board */}
        <div
          className="rise relative lg:pl-2"
          style={{ animationDelay: "200ms" }}
        >
          {/* Offset accent border behind the card */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-6 -top-6 inset-y-6 rounded-xl border border-teal-lift/18"
          />

          <article
            aria-label="Control state proof"
            className="relative overflow-hidden rounded-xl border border-white/22 bg-white/[0.06] shadow-[0_18px_50px_rgba(0,0,0,0.18)] backdrop-blur-sm"
          >
            {/* Proof head */}
            <div className="flex items-center justify-between gap-4 border-b border-white/14 px-5 py-4">
              <p className="rubric text-teal-lift">{CONTROL_PROOF.label}</p>
              <span className="inline-flex items-center gap-2 rubric text-amber-fill/90">
                <span
                  aria-hidden="true"
                  className="block size-1.5 rounded-full bg-amber-line shadow-[0_0_0_4px_rgba(200,144,31,0.14)]"
                />
                {CONTROL_PROOF.state}
              </span>
            </div>

            {/* Proof body */}
            <div className="px-5 py-6">
              <p className="text-xs text-white/55 tracking-wide">
                {CONTROL_PROOF.kicker}
              </p>
              <h2 className="mt-2 font-display font-semibold text-[1.875rem] leading-[1.05] tracking-[-0.025em] text-white">
                {CONTROL_PROOF.title}
              </h2>
              <p className="mt-4 text-sm leading-[1.55] text-white/65">
                {CONTROL_PROOF.body}
              </p>

              {/* Invariant */}
              <div
                className="mt-5 inline-flex items-center gap-2 border-l-2 border-teal-lift/70 bg-white/[0.035] px-3 py-2 font-mono text-xs text-teal-lift"
                translate="no"
              >
                {CONTROL_PROOF.invariant}
              </div>

              {/* Control stages */}
              <div
                aria-label="Control stages"
                className="mt-6 grid grid-cols-3 divide-x divide-white/14 border-y border-white/14"
              >
                {CONTROL_PROOF.stages.map((stage) => (
                  <div className="px-0 py-4 first:pr-4 [&:not(:first-child)]:px-4" key={stage.name}>
                    <p className="rubric text-white/45">{stage.name}</p>
                    <p
                      className={`mt-1.5 text-sm font-semibold ${
                        stage.tone === "amber"
                          ? "text-amber-fill/90"
                          : stage.tone === "teal"
                            ? "text-teal-lift"
                            : "text-white/40"
                      }`}
                    >
                      {stage.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Proof foot */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/14 px-5 py-4 text-xs text-white/45">
              <span>{CONTROL_PROOF.foot}</span>
              <span>{CONTROL_PROOF.illustrative}</span>
            </div>
          </article>
        </div>
      </div>

      {/* Hero footer: three assurance chips only */}
      <div className="border-t border-white/10">
        <div className="page-shell py-5">
          <ul
            aria-label="Assurance"
            className="flex flex-wrap gap-x-6 gap-y-2"
          >
            {HERO_ASSURANCE.map((chip) => (
              <li
                className="inline-flex items-center gap-2 text-xs text-white/55"
                key={chip}
              >
                <span
                  aria-hidden="true"
                  className="block size-1.5 rounded-full bg-teal"
                />
                {chip}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
