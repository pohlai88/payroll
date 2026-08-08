import { NODE_KINDS, ROOTS } from "@/marketing/content";
import { SectionHeading } from "@/marketing/section-heading";

/* Color coding per node kind category */
const KIND_COLOR: Record<string, string> = {
	input: "text-ledger border-ledger/40 bg-ledger/5",
	setting: "text-ledger border-ledger/40 bg-ledger/5",
	classification: "text-brass border-brass/40 bg-brass/5",
	table: "text-brass border-brass/40 bg-brass/5",
	calculation: "text-stamp border-stamp/40 bg-stamp/5",
	rounding: "text-stamp border-stamp/40 bg-stamp/5",
	proration: "text-stamp border-stamp/40 bg-stamp/5",
	external: "text-ink-muted border-rule bg-paper-deep",
	override: "text-ink-muted border-rule bg-paper-deep",
	aggregate: "text-ink border-ink/30 bg-paper-card",
	na: "text-ink-faint border-rule bg-paper",
};

export function DrillDown() {
	return (
		<section className="border-rule border-b bg-paper-deep/45" id="drill">
			<div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-28">
				<SectionHeading
					index="04"
					lede="Open any figure and you land on a node. There are eleven kinds, and every one of them answers a specific question — including the ones payroll software normally leaves blank."
					rubric="Drill-down"
					title='Eleven kinds of answer to "why this number?"'
				/>

				<div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
					{/* Node kinds table */}
					<div className="grain overflow-hidden rounded-sm border border-rule bg-paper-card">
						<dl>
							{NODE_KINDS.map((kind) => (
								<div
									className="flex flex-col gap-2 border-rule-hair border-b px-5 py-4 last:border-0 sm:flex-row sm:items-baseline sm:gap-6 hover:bg-paper-deep/50 transition-colors"
									key={kind.id}
								>
									<dt className="shrink-0">
										<span
											className={`rubric inline-block rounded-sm border px-1.5 py-0.5 tracking-tight ${KIND_COLOR[kind.id] ?? "text-ink-faint border-rule"}`}
										>
											{kind.label}
										</span>
									</dt>
									<dd className="ml-0 text-ink-muted text-sm leading-relaxed">
										{kind.answers}
									</dd>
								</div>
							))}
						</dl>
					</div>

					{/* Sidebar */}
					<aside className="flex flex-col gap-8">
						{/* Numeric vocabulary */}
						<div>
							<p className="rubric text-ink-faint">
								The whole numeric vocabulary
							</p>
							<ul className="mt-4 flex list-none flex-wrap gap-1.5 p-0">
								{ROOTS.map((root) => (
									<li
										className="rounded-sm border border-rule bg-paper-card px-2 py-1 font-mono text-[0.68rem] text-ink-muted transition-colors hover:border-ink hover:text-ink"
										key={root}
									>
										{root}
									</li>
								))}
							</ul>
							<p className="mt-4 text-ink-muted text-sm leading-relaxed">
								Nineteen roots, and nothing else is displayable. A screen that
								needs a number not on this list gets a new root in the emitter —
								never arithmetic in a component.
							</p>
						</div>

						{/* Unknown callout */}
						<div className="border-stamp border-l-2 pl-5">
							<p className="rubric text-stamp">Unknown is a value</p>
							<p className="mt-4 text-ink leading-relaxed">
								When PCB has not been entered, net pay is{" "}
								<span className="rounded-sm bg-paper-deep px-1.5 py-0.5 font-mono text-[0.78rem]">
									SEN_UNKNOWN
								</span>{" "}
								— and it renders as unknown. Substituting zero would be the
								single most damaging thing this layer could do, so it is
								structurally prevented rather than discouraged.
							</p>
						</div>

						{/* Color legend */}
						<div className="rounded-sm border border-rule bg-paper p-4">
							<p className="rubric text-ink-faint">Node colour key</p>
							<ul className="mt-3 space-y-2 text-xs text-ink-muted">
								<li className="flex items-center gap-2">
									<span className="inline-block h-2 w-2 rounded-full bg-ledger/60" />
									Green — data source (input, setting)
								</li>
								<li className="flex items-center gap-2">
									<span className="inline-block h-2 w-2 rounded-full bg-brass/60" />
									Gold — rule application (classification, table)
								</li>
								<li className="flex items-center gap-2">
									<span className="inline-block h-2 w-2 rounded-full bg-stamp/60" />
									Red — arithmetic node (calculation, rounding, proration)
								</li>
								<li className="flex items-center gap-2">
									<span className="inline-block h-2 w-2 rounded-full bg-ink-faint/40" />
									Neutral — provenance and meta nodes
								</li>
							</ul>
						</div>
					</aside>
				</div>
			</div>
		</section>
	);
}
