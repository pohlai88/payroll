import { CONTROL_FAILURE } from "@/marketing/content";
import { SectionIntro } from "@/marketing/section-intro";

/**
 * Movement 3 — issue-first control failure beat.
 * Uses a real finding (PCB_UNVERIFIED), never revision mismatch language.
 */
export function ControlFailure() {
  return (
    <section
      aria-label="When a control fails"
      className="section-space relative border-hair border-t bg-ground-2"
      id="failure"
    >
      <span
        aria-hidden="true"
        className="pattern-grid-light pointer-events-none absolute inset-0 opacity-40"
      />
      <div className="page-shell relative">
        <SectionIntro
          align="split"
          body="When a finding or gate condition fails, the run does not advance. The operator sees the blocking condition before the next decision."
          eyebrow={CONTROL_FAILURE.eyebrow}
          title={CONTROL_FAILURE.title}
        />

        <article
          aria-label="Illustrative finding"
          className="panel-cut-lg mx-auto max-w-3xl border border-amber-line/50 bg-ground px-6 py-7 sm:px-8 sm:py-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="rubric text-amber-ink">{CONTROL_FAILURE.code}</p>
            <p className="text-meta text-xs">{CONTROL_FAILURE.illustrative}</p>
          </div>
          <h3 className="mt-4 font-display font-semibold text-2xl text-navy tracking-[-0.03em] sm:text-3xl">
            {CONTROL_FAILURE.findingTitle}
          </h3>
          <p className="mt-4 max-w-[54ch] text-base text-meta leading-[1.7]">
            {CONTROL_FAILURE.body}
          </p>
        </article>
      </div>
    </section>
  );
}
