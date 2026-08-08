import { Closing } from "@/marketing/sections/closing";
import { DrillDown } from "@/marketing/sections/drill-down";
import { Hero } from "@/marketing/sections/hero";
import { Ledger } from "@/marketing/sections/ledger";
import { Method } from "@/marketing/sections/method";
import { Provenance } from "@/marketing/sections/provenance";
import { SiteFooter } from "@/marketing/sections/site-footer";
import { SiteNav } from "@/marketing/sections/site-nav";

export function Landing() {
  return (
    <>
      <a
        className="sr-only rounded-sm bg-ink px-4 py-2 text-paper focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[60]"
        href="#ledger"
      >
        Skip to content
      </a>
      <SiteNav />
      <main>
        <Hero />
        <Ledger />
        <Method />
        <Provenance />
        <DrillDown />
        <Closing />
      </main>
      <SiteFooter />
    </>
  );
}
