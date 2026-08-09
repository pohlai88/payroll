/**
 * @feature marketing
 * @layer ui
 * @chain
 *   ui:      src/marketing/landing.tsx (+ sections/*)
 *   client:  (none — static marketing; no /v1)
 *   route:   (none)
 *   service: (none)
 *   repo:    (none)
 *   schema:  (none)
 *   spine:   landing.html → src/marketing/main.tsx
 *
 * Marketing landing composition (SPA-only hub). Isolated from product shell.
 */

import { AuthorityEvidence } from "@/marketing/sections/authority-evidence";
import { Closing } from "@/marketing/sections/closing";
import { ControlFailure } from "@/marketing/sections/control-failure";
import { DecisionControl } from "@/marketing/sections/decision-control";
import { Hero } from "@/marketing/sections/hero";
import { ProofLedger } from "@/marketing/sections/proof-ledger";
import { RunEvidence } from "@/marketing/sections/run-evidence";
import { SiteFooter } from "@/marketing/sections/site-footer";
import { SiteNav } from "@/marketing/sections/site-nav";

/**
 * Heads-up spine: Control → Asks → Failure → Proof → Authority → Next → Act.
 */
export function Landing() {
  return (
    <>
      <a
        className="sr-only rounded-md bg-navy px-4 py-2 text-ground focus-visible:not-sr-only focus-visible:absolute focus-visible:top-[max(0.75rem,env(safe-area-inset-top))] focus-visible:left-[max(0.75rem,env(safe-area-inset-left))] focus-visible:z-60"
        href="#main-content"
      >
        Skip to content
      </a>
      <SiteNav />
      <main id="main-content">
        <Hero />
        <DecisionControl />
        <ControlFailure />
        <ProofLedger />
        <AuthorityEvidence />
        <RunEvidence />
        <Closing />
      </main>
      <SiteFooter />
    </>
  );
}
