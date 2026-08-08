import { RULE_PACK } from "@/marketing/content";

const COLOPHON = [
	{
		id: "engine",
		term: "Engine",
		detail: "Pure TypeScript, integer sen, no database",
	},
	{
		id: "graph",
		term: "Graph",
		detail: "Derivation DAG mirrored against the arithmetic",
	},
	{
		id: "store",
		term: "Store",
		detail: "Postgres, invariants held by plpgsql triggers",
	},
	{ id: "pack", term: "Rule pack", detail: RULE_PACK.id },
] as const;

const NAV_SECTIONS = [
	{
		id: "about",
		heading: "On this page",
		links: [
			{ id: "ledger", label: "The ledger", href: "#ledger" },
			{ id: "method", label: "Method", href: "#method" },
			{ id: "provenance", label: "Provenance", href: "#provenance" },
			{ id: "drill", label: "Drill-down", href: "#drill" },
		],
	},
] as const;

export function SiteFooter() {
	return (
		<footer className="border-rule border-t bg-paper">
			<div className="mx-auto max-w-6xl px-6 py-14 md:px-10">
				<div className="grid gap-10 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)] md:gap-12">
					{/* Brand */}
					<div>
						<a className="no-underline" href="#top">
							<p className="font-display text-2xl tracking-tight">
								Clarity{" "}
								<span className="text-stamp">Payroll</span>
							</p>
						</a>
						<p className="mt-3 max-w-xs text-ink-muted text-sm leading-relaxed">
							Malaysian statutory payroll with a derivation graph beside every
							figure. Nothing is hidden.
						</p>
						<div className="mt-6">
							<a
								className="rounded-sm border border-ink bg-ink px-4 py-2 font-medium text-[0.8rem] text-paper-card no-underline transition-colors hover:border-stamp hover:bg-stamp"
								href="/"
							>
								Open the app
							</a>
						</div>
					</div>

					{/* Nav */}
					{NAV_SECTIONS.map((section) => (
						<div key={section.id}>
							<p className="rubric text-ink-faint">{section.heading}</p>
							<ul className="mt-4 space-y-2.5 list-none p-0">
								{section.links.map((link) => (
									<li key={link.id}>
										<a
											className="text-ink-muted text-sm no-underline transition-colors hover:text-stamp"
											href={link.href}
										>
											{link.label}
										</a>
									</li>
								))}
							</ul>
						</div>
					))}

					{/* Colophon */}
					<dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
						<div className="sm:col-span-2">
							<p className="rubric text-ink-faint">Colophon</p>
						</div>
						{COLOPHON.map((item) => (
							<div key={item.id}>
								<dt className="rubric text-ink-faint">{item.term}</dt>
								<dd className="mt-1 ml-0 text-ink-muted text-sm">
									{item.detail}
								</dd>
							</div>
						))}
					</dl>
				</div>

				{/* Bottom bar */}
				<div className="mt-12 flex flex-col gap-4 border-rule border-t pt-6 sm:flex-row sm:items-start sm:justify-between">
					<p className="max-w-xl text-ink-faint text-xs leading-relaxed">
						Figures shown on this page are illustrative and drawn from the
						shipped rule pack. They are not tax advice. Always verify against the
						current official schedules published by KWSP, PERKESO, HASiL and
						JTKSM before each payroll year.
					</p>
					<p className="shrink-0 font-mono text-[0.65rem] text-ink-faint">
						{RULE_PACK.id}
					</p>
				</div>
			</div>
		</footer>
	);
}
