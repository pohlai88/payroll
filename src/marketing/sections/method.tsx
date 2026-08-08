import { CAPABILITIES } from "@/marketing/content";
import { SectionHeading } from "@/marketing/section-heading";

/* Icon paths for each capability — inline SVG for zero network requests */
const ICONS: Record<string, string> = {
  sen: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z",
  golden:
    "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z",
  graph:
    "M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z",
  packs:
    "M20 6h-2.18c.07-.44.18-.88.18-1.36C18 2.53 15.47 0 12.36 0c-1.73 0-3.26.78-4.36 2L12 6l4-4c.88.88 1.37 2.07 1.37 3.28 0 .48-.1.92-.18 1.36H15l-3 3-3-3H7.18C7.1 5.92 7 5.48 7 5c0-.5.1-.97.27-1.42L3 7.5 7 12v5H5v2h14v-2h-2v-5l4-4.5-3-2z",
  invariants:
    "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z",
  bilingual:
    "M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z",
};

export function Method() {
  return (
    <section className="border-rule border-b bg-paper-deep/45" id="method">
      <div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-28">
        <SectionHeading
          index="02"
          lede="Six decisions, each of which is load-bearing. Together they are the reason a figure produced by this system can still be defended after the person who ran the payroll has left."
          rubric="Method"
          title="Correctness that is structural, not aspirational."
        />

        {/* Bento-inspired grid: first item spans 2 cols on md+ */}
        <div className="grid gap-px border-rule border-t border-b bg-rule sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((item, i) => (
            <div
              className={`group relative bg-paper px-6 py-8 transition-colors hover:bg-paper-card ${
                i === 0 ? "sm:col-span-2 lg:col-span-1" : ""
              }`}
              key={item.id}
            >
              {/* Index + icon row */}
              <div className="flex items-start justify-between gap-4">
                <span className="figure-nums shrink-0 font-display text-[2.5rem] text-stamp/40 leading-none transition-colors group-hover:text-stamp/70">
                  {item.index}
                </span>
                {ICONS[item.id] && (
                  <svg
                    aria-hidden="true"
                    className="mt-1 size-5 shrink-0 text-ink-faint opacity-50 transition-opacity group-hover:opacity-100"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d={ICONS[item.id]} />
                  </svg>
                )}
              </div>

              {/* Content */}
              <div className="mt-4">
                <h3 className="font-display text-xl leading-snug md:text-2xl">
                  {item.title}
                </h3>
                <p className="mt-3 text-ink-muted text-sm leading-relaxed md:text-base">
                  {item.body}
                </p>
              </div>

              {/* Hover accent line */}
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-0 h-0.5 w-0 bg-stamp transition-all duration-300 group-hover:w-full"
              />
            </div>
          ))}
        </div>

        {/* Bottom note */}
        <p className="mt-8 max-w-2xl text-ink-faint text-sm leading-relaxed">
          These six decisions are not configuration options — they are hardcoded
          constraints. Correctness is not delegated to the user.
        </p>
      </div>
    </section>
  );
}
