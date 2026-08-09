/**
 * @feature marketing
 * @layer ui
 *
 * Marketing landing surface.
 */

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CtaLinkProps {
  readonly href: string;
  readonly children: string;
  readonly tone?: "solid" | "ghost" | "inverse";
  readonly className?: string;
}

function toneClasses(tone: CtaLinkProps["tone"]): string {
  if (tone === "inverse") {
    return "h-11 rounded-md bg-white px-5 font-semibold text-navy text-sm hover:bg-mint-fill focus-visible:outline-teal-lift";
  }
  if (tone === "ghost") {
    return "h-11 rounded-md border border-white/25 bg-transparent px-5 font-medium text-sm text-white hover:border-teal-lift hover:bg-white/5 hover:text-teal-lift focus-visible:outline-teal-lift";
  }
  return "h-11 rounded-md bg-navy px-5 font-semibold text-ground text-sm hover:bg-navy-2 focus-visible:outline-teal";
}

/**
 * Marketing CTA shaped after studio button-04 / button-16: a decisive
 * action link with an arrow that advances on hover. Kept as an anchor so
 * navigation stays native and testable. Avoids shadcn button `transition-all`
 * / `outline-none` so focus and motion stay guideline-clean.
 */
export function CtaLink({
  href,
  children,
  tone = "solid",
  className,
}: CtaLinkProps) {
  return (
    <a
      className={cn(
        "group/cta inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap transition-[background-color,border-color,color,transform] duration-200",
        toneClasses(tone),
        className
      )}
      href={href}
    >
      {children}
      <ArrowRight aria-hidden="true" className="cta-arrow size-4" />
    </a>
  );
}
