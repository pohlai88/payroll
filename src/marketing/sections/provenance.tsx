import { RULE_PACK, SOURCES } from "@/marketing/content";
import { SectionHeading } from "@/marketing/section-heading";

export function Provenance() {
	return (
		<section className="border-rule border-b" id="provenance">
			<div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-28">
				<SectionHeading
					index="03"
					lede="Not a changelog entry claiming the rates were updated — the documents themselves, each with its issuer, the date it was retrieved and a SHA-256 of what was read. A rate is never a literal in code."
					rubric="Provenance"
					title="Eight documents stand behind every figure."
				/>

				{/* Source table */}
				<div className="grain overflow-hidden rounded-sm border border-rule bg-paper-card">
					<div className="overflow-x-auto">
						<table className="w-full min-w-[42rem] border-collapse text-left">
							<thead>
								<tr className="border-ink border-b-2 bg-paper">
									<th
										className="rubric px-5 py-3.5 text-ink-faint"
										scope="col"
									>
										Ref
									</th>
									<th
										className="rubric px-5 py-3.5 text-ink-faint"
										scope="col"
									>
										Issuer
									</th>
									<th
										className="rubric px-5 py-3.5 text-ink-faint"
										scope="col"
									>
										Document
									</th>
									<th
										className="rubric px-5 py-3.5 text-ink-faint"
										scope="col"
									>
										Retrieved
									</th>
									<th
										className="rubric px-5 py-3.5 text-right text-ink-faint"
										scope="col"
									>
										SHA-256
									</th>
								</tr>
							</thead>
							<tbody>
								{SOURCES.map((source) => (
									<tr
										className="group border-rule-hair border-b align-baseline transition-colors hover:bg-paper-deep/60 last:border-0"
										key={source.ref}
									>
										<td className="px-5 py-4">
											<span className="rubric inline-block rounded-sm border border-stamp/40 px-1.5 py-0.5 text-stamp transition-colors group-hover:border-stamp/70 group-hover:bg-stamp/5">
												{source.ref}
											</span>
										</td>
										<td className="px-5 py-4">
											<span className="text-ink text-sm font-medium">
												{source.issuer}
											</span>
										</td>
										<td className="px-5 py-4">
											<span className="text-ink-muted text-sm leading-relaxed">
												{source.title}
											</span>
										</td>
										<td className="px-5 py-4">
											<span className="figure-nums font-mono text-ink-faint text-xs">
												{source.retrievedAt}
											</span>
										</td>
										<td className="px-5 py-4 text-right">
											{source.digest === null ? (
												<span className="rounded-sm bg-paper-deep px-2 py-0.5 font-mono text-[0.65rem] text-ink-faint italic">
													not hashed
												</span>
											) : (
												<span className="font-mono text-brass text-xs tabular-nums tracking-tight">
													{source.digest}
													<span className="text-ink-faint">…</span>
												</span>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{/* Footer bar */}
					<div className="flex flex-wrap items-center justify-between gap-4 border-rule border-t bg-paper px-5 py-4">
						<p className="font-mono text-[0.65rem] text-ink-faint">
							Pack{" "}
							<span className="text-ink">{RULE_PACK.id}</span>
							{" — "}
							effective {RULE_PACK.effectiveFrom}
						</p>
						<p className="font-mono text-[0.65rem] text-ink-faint">
							{RULE_PACK.summary}
						</p>
					</div>
				</div>

				{/* Explanatory note */}
				<div className="mt-8 grid gap-6 md:grid-cols-2">
					<div className="border-rule border-l pl-4">
						<p className="rubric text-ink-faint">Versioned and effective-dated</p>
						<p className="mt-3 text-ink-muted text-sm leading-relaxed">
							A figure computed under one pack is always re-explained against
							that pack, never against whichever tables happen to be current
							when the question is asked.
						</p>
					</div>
					<div className="border-rule border-l pl-4">
						<p className="rubric text-ink-faint">SHA-256 integrity</p>
						<p className="mt-3 text-ink-muted text-sm leading-relaxed">
							Each hashed document was read, digested and committed alongside
							the table values it produced. A changed document produces a
							different hash — the mismatch is a build failure, not a warning.
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}
