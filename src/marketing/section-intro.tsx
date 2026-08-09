/**
 * @feature marketing
 * @layer ui
 *
 * Marketing landing surface.
 */

interface SectionIntroProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly body?: string;
  readonly align?: "left" | "split";
}

/**
 * A restrained section threshold: short operational label, decisive display
 * heading, and optional body copy. Split alignment is reserved for sections
 * where the supporting explanation has equal weight with the heading.
 */
export function SectionIntro({
  eyebrow,
  title,
  body,
  align = "left",
}: SectionIntroProps) {
  const isSplit = align === "split";

  return (
    <header
      className={
        isSplit ? "mb-14 grid gap-6 lg:grid-cols-12 lg:items-end" : "mb-14"
      }
    >
      <div className={isSplit ? "lg:col-span-7" : ""}>
        <div className="flex items-center gap-4">
          <p className="rubric shrink-0 text-teal">{eyebrow}</p>
          <span
            aria-hidden="true"
            className="rule-draw rule-fade h-px flex-1 origin-left"
          />
        </div>
        <h2 className="mt-6 max-w-[20ch] font-display font-semibold text-[clamp(2rem,4.2vw,3.25rem)] text-navy leading-[1.04] tracking-[-0.035em]">
          {title}
        </h2>
      </div>
      {body === undefined ? null : (
        <p
          className={`max-w-[62ch] text-base text-meta leading-[1.65] md:text-lg ${
            isSplit ? "lg:col-span-5" : "mt-6"
          }`}
        >
          {body}
        </p>
      )}
    </header>
  );
}
