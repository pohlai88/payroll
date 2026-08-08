/**
 * The recurring editorial device: a numbered rubric in the left gutter, a
 * display heading, and a rule that draws itself in beneath. Every section on
 * the page is framed by it, which is what makes the page read as one document
 * rather than a stack of cards.
 */

interface SectionHeadingProps {
  readonly index: string;
  readonly rubric: string;
  readonly title: string;
  readonly lede?: string;
}

export function SectionHeading({
  index,
  rubric,
  title,
  lede,
}: SectionHeadingProps) {
  return (
    <header className="mb-12 md:mb-16">
      <div className="flex items-baseline gap-4 md:gap-6">
        <span className="rubric shrink-0 text-stamp tabular-nums">{index}</span>
        <span className="rubric text-ink-faint">{rubric}</span>
        <span
          aria-hidden="true"
          className="rule-draw h-px flex-1 bg-rule"
          style={{ animationDelay: "120ms" }}
        />
      </div>
      <h2 className="mt-5 max-w-3xl text-balance font-display text-3xl leading-[1.05] sm:text-4xl md:text-5xl">
        {title}
      </h2>
      {lede === undefined ? null : (
        <p className="mt-5 max-w-2xl text-base text-ink-muted leading-relaxed md:text-lg">
          {lede}
        </p>
      )}
    </header>
  );
}
