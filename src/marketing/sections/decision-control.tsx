import {
  FileSearch,
  ListChecks,
  LockKeyhole,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DECISION_CONTROLS } from "@/marketing/content";
import { SectionIntro } from "@/marketing/section-intro";

const CONTROL_ICONS: readonly LucideIcon[] = [
  FileSearch,
  LockKeyhole,
  ListChecks,
];

/**
 * Inspired by studio features-section icon grids: equal semantic units with
 * icon, title, and supporting copy. Asymmetry remains through evidence lines
 * rather than decorative charts or fake metrics.
 */
export function DecisionControl() {
  return (
    <section className="section-space relative bg-ground" id="control">
      <span
        aria-hidden="true"
        className="pattern-grid-light pointer-events-none absolute inset-0 opacity-40"
      />
      <div className="page-shell relative">
        <SectionIntro
          align="split"
          body="The product does not ask an operator to infer readiness from a dashboard. Each decision returns the issues, revision conditions, or line exclusions that determine what can proceed."
          eyebrow="Operational control"
          title="Three questions before payroll moves."
        />

        <ol className="grid gap-5 md:grid-cols-3">
          {DECISION_CONTROLS.map((control, index) => {
            const Icon = CONTROL_ICONS[index] ?? FileSearch;
            return (
              <li
                className="panel-cut group flex h-full flex-col border border-hair bg-ground-2/90 p-6 transition-colors duration-200 hover:border-teal/35 hover:bg-mint-fill/40"
                key={control.label}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-11 items-center justify-center rounded-md border border-teal/25 bg-mint-fill text-teal">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <Badge className="rounded-md border-teal/20 bg-transparent px-2 py-0 font-mono font-normal text-teal text-xs tracking-[0.08em]">
                    {control.index}
                  </Badge>
                </div>
                <h3 className="mt-6 font-sans font-semibold text-navy text-xl tracking-[-0.025em]">
                  {control.label}
                </h3>
                <p className="mt-2 text-base text-meta leading-relaxed">
                  {control.question}
                </p>
                <p className="mt-4 flex-1 text-slate text-sm leading-relaxed">
                  {control.body}
                </p>
                <p className="mt-6 border-teal/20 border-t pt-4 font-mono text-meta text-xs leading-relaxed">
                  {control.evidence}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
