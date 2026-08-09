import type { ReactNode } from "react";

interface EvidenceDisclosureProps {
  readonly id?: string;
  readonly label: string;
  readonly summary: string;
  readonly children: ReactNode;
}

/**
 * Supporting implementation evidence remains available without dominating the
 * operator narrative. Native details/summary preserves keyboard and print
 * semantics; the outline shape follows studio accordion-09. Optional `id`
 * enables deep links (`#source-records`) with scroll-margin from the sticky nav.
 */
export function EvidenceDisclosure({
  id,
  label,
  summary,
  children,
}: EvidenceDisclosureProps) {
  return (
    <details
      className="group mb-4 rounded-md border border-hair bg-ground open:border-teal/30 open:bg-mint-fill/20"
      id={id}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-6 rounded-md px-5 py-5 marker:content-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal focus-visible:outline-offset-2">
        <span className="min-w-0">
          <span className="rubric block text-teal">{label}</span>
          <span className="mt-2 block max-w-[64ch] break-words text-base text-meta leading-relaxed">
            {summary}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-hair bg-ground font-light text-lg text-navy leading-none transition-transform duration-200 group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className="border-hair border-t px-5 pt-5 pb-6">{children}</div>
    </details>
  );
}
