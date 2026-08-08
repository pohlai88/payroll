const PROOF_POINTS = [
	{ id: "golden", text: "37 real employees, verified to the sen" },
	{ id: "graph", text: "Derivation DAG beside every arithmetic figure" },
	{ id: "pack", text: "Eight cited source documents, SHA-256 committed" },
	{ id: "db", text: "Invariants held by plpgsql triggers, not app code" },
] as const;

export function Closing() {
	return (
		<section className="grain relative overflow-hidden bg-ink text-paper">
			{/* Marginal rule */}
			<span
				aria-hidden="true"
				className="absolute inset-y-0 left-6 hidden w-px bg-stamp/40 md:block lg:left-10"
			/>

			{/* Subtle horizontal fibre */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0"
				style={{
					backgroundImage:
						"repeating-linear-gradient(to bottom, transparent 0 31px, color-mix(in srgb, white 4%, transparent) 31px 32px)",
				}}
			/>

			<div className="relative mx-auto max-w-6xl px-6 py-24 md:px-10 md:py-32">
				<div className="grid items-end gap-12 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-16">
					{/* Left: headline + body + CTAs */}
					<div>
						<p className="rubric text-paper/45">Open the ledger</p>
						<h2
							className="mt-6 max-w-3xl font-display text-[clamp(2.2rem,5.5vw,4rem)] text-paper leading-[1] tracking-[-0.03em]"
							style={{
								fontVariationSettings: '"opsz" 144, "SOFT" 40, "WONK" 1',
							}}
						>
							Run the month. Then ask it{" "}
							<em className="text-stamp not-italic">why</em>.
						</h2>
						<p className="mt-7 max-w-xl text-lg text-paper/70 leading-relaxed">
							Import your employee master, compute against a cited rule pack, and
							open any figure down to the row of the schedule it was read from.
						</p>

						<div className="mt-10 flex flex-wrap items-center gap-3">
							<a
								className="rounded-sm bg-paper px-6 py-3 font-medium text-ink text-sm no-underline transition-colors hover:bg-stamp hover:text-paper"
								href="/"
							>
								Open the app
							</a>
							<a
								className="rounded-sm border border-paper/25 px-6 py-3 font-medium text-paper text-sm no-underline transition-colors hover:border-paper/60 hover:bg-paper/5"
								href="#ledger"
							>
								Re-read the ledger
							</a>
						</div>
					</div>

					{/* Right: proof-point list */}
					<aside>
						<p className="rubric text-paper/40">Why it holds</p>
						<ul className="mt-5 space-y-0 list-none p-0 border-paper/15 border-t">
							{PROOF_POINTS.map((pt) => (
								<li
									className="flex items-baseline gap-3 border-paper/15 border-b py-4"
									key={pt.id}
								>
									<span
										aria-hidden="true"
										className="mt-0.5 shrink-0 text-stamp"
									>
										§
									</span>
									<span className="text-paper/70 text-sm leading-relaxed">
										{pt.text}
									</span>
								</li>
							))}
						</ul>
					</aside>
				</div>
			</div>
		</section>
	);
}
