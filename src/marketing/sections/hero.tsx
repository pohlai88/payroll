import { RULE_PACK } from "@/marketing/content";

const TALLY = [
  { id: "roots", figure: "19", label: "displayable roots" },
  { id: "kinds", figure: "11", label: "node kinds" },
  { id: "sources", figure: "8", label: "cited sources" },
  { id: "tables", figure: "18", label: "tables under trigger" },
] as const;

export function Hero() {
  return (
    <section
      className="grain relative overflow-hidden border-rule border-b"
      id="top"
    >
      {/* Marginal rules: left and right edge of a ruled statutory page */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-6 hidden w-px bg-stamp/20 md:block lg:left-10"
      />
      <span
        aria-hidden="true"
        className="absolute inset-y-0 right-6 hidden w-px bg-rule/60 md:block lg:right-10"
      />

      {/* Faint ledger ruling across the background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0 47px, color-mix(in srgb, var(--stamp) 12%, transparent) 47px 48px)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-0 md:px-10 md:pt-28">
        {/* Eyebrow */}
        <p
          className="rise rubric text-ink-faint"
          style={{ animationDelay: "60ms" }}
        >
          Malaysian statutory payroll
          <span className="mx-2.5 text-stamp">§</span>
          Rule pack {RULE_PACK.id}
        </p>

        <div className="mt-8 grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
          {/* Left: headline + body + CTAs */}
          <div>
            <h1
              className="rise max-w-4xl font-display text-[clamp(2.6rem,7.2vw,5rem)] leading-[0.93] tracking-[-0.03em]"
              style={{ animationDelay: "140ms" }}
            >
              Every ringgit,{" "}
              <em
                className="text-stamp not-italic"
                style={{
                  fontVariationSettings: '"opsz" 144, "SOFT" 60, "WONK" 1',
                }}
              >
                traceable
              </em>{" "}
              to the statute that produced it.
            </h1>

            <p
              className="rise mt-8 max-w-xl text-ink-muted text-lg leading-relaxed md:text-xl"
              style={{ animationDelay: "240ms" }}
            >
              Clarity computes Malaysian payroll from cited statutory tables and
              emits a derivation graph beside every figure — so any number on
              any payslip can be opened, traced to its source document, and
              re-explained years later.
            </p>

            {/* Pull-quote */}
            <p
              className="rise mt-6 max-w-xl border-stamp border-l-2 pl-4 font-display text-ink text-xl italic leading-snug"
              style={{ animationDelay: "320ms" }}
            >
              "Nothing is hidden" is a failing test, not a slogan.
            </p>

            {/* CTAs */}
            <div
              className="rise mt-10 flex flex-wrap items-center gap-3"
              style={{ animationDelay: "400ms" }}
            >
              <a
                className="rounded-sm border border-ink bg-ink px-6 py-3 font-medium text-paper-card text-sm no-underline transition-colors hover:border-stamp hover:bg-stamp"
                href="/"
              >
                Open the app
              </a>
              <a
                className="rounded-sm border border-rule px-6 py-3 font-medium text-ink text-sm no-underline transition-colors hover:border-ink hover:bg-paper-deep"
                href="#ledger"
              >
                See a month, line by line →
              </a>
            </div>

            {/* Trust pill */}
            <p
              className="rise mt-8 text-ink-faint text-xs leading-relaxed"
              style={{ animationDelay: "460ms" }}
            >
              Golden master: 37 real employees · every figure verified to the
              sen · effective {RULE_PACK.effectiveFrom}
            </p>
          </div>

          {/* Right: certification stamp + micro-graph */}
          <div className="lg:pt-8">
            {/* Main stamp */}
            <div
              className="strike stamped mx-auto w-fit rounded-sm bg-paper-card px-7 py-6 text-center lg:mx-0"
              style={{ animationDelay: "560ms" }}
            >
              <p className="rubric">Golden master</p>
              <p className="figure-nums mt-3 font-display text-5xl leading-none">
                37
              </p>
              <p className="rubric mt-3 leading-relaxed">
                real employees
                <br />
                verified to the sen
              </p>
              <span
                aria-hidden="true"
                className="mx-auto mt-4 block h-px w-10 bg-stamp/50"
              />
              <p className="mt-3 font-mono text-[0.65rem] tracking-tight">
                effective {RULE_PACK.effectiveFrom}
              </p>
            </div>

            {/* Secondary note card */}
            <div
              className="rise mx-auto mt-6 max-w-[18rem] rounded-sm border border-rule bg-paper px-5 py-4 lg:mx-0"
              style={{ animationDelay: "680ms" }}
            >
              <p className="rubric text-ink-faint">Rule pack summary</p>
              <p className="mt-2 font-mono text-[0.7rem] text-ink-muted leading-relaxed">
                {RULE_PACK.summary}
              </p>
            </div>
          </div>
        </div>

        {/* Tally strip — pinned flush to the bottom of the hero */}
        <dl
          className="rise mt-16 grid grid-cols-2 gap-px border-rule border-t bg-rule sm:grid-cols-4"
          style={{ animationDelay: "480ms" }}
        >
          {TALLY.map((item) => (
            <div
              className="group bg-paper px-1 pt-5 pb-6 transition-colors hover:bg-paper-card sm:px-2"
              key={item.id}
            >
              <dt className="figure-nums font-display text-4xl text-ink leading-none transition-colors group-hover:text-stamp md:text-5xl">
                {item.figure}
              </dt>
              <dd className="rubric mt-2.5 ml-0 text-ink-faint transition-colors group-hover:text-ink-muted">
                {item.label}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
