import { Separator } from "@/components/ui/separator";
import { NAV_LINKS } from "@/marketing/content";
import { CtaLink } from "@/marketing/cta-link";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 border-hair border-b bg-ground/95 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(19,48,63,0.04)] backdrop-blur-md">
      <nav
        aria-label="Primary"
        className="page-shell flex h-16 items-center gap-3 sm:gap-6"
      >
        <a
          className="shrink-0 font-display font-semibold text-[1.2rem] text-navy tracking-[-0.04em] transition-colors duration-200 hover:text-teal"
          href="/landing.html"
          translate="no"
        >
          Clarity
        </a>
        <Separator
          className="hidden h-5 bg-hair data-vertical:h-5 md:block"
          orientation="vertical"
        />
        <ul className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-5 md:gap-6 [&::-webkit-scrollbar]:hidden">
          {NAV_LINKS.map((link) => (
            <li className="shrink-0" key={link.href}>
              <a
                className="font-medium text-meta text-sm transition-colors duration-200 hover:text-navy"
                href={link.href}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <CtaLink className="ml-1 shrink-0 sm:ml-auto" href="/">
          Open the app
        </CtaLink>
      </nav>
    </header>
  );
}
