"use client";

import { MenuIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { RULE_PACK } from "@/marketing/content";

const NAV_LINKS = [
	{ id: "ledger", href: "#ledger", label: "The ledger" },
	{ id: "method", href: "#method", label: "Method" },
	{ id: "provenance", href: "#provenance", label: "Provenance" },
	{ id: "drill", href: "#drill", label: "Drill-down" },
] as const;

export function SiteNav() {
	const [open, setOpen] = useState(false);

	return (
		<header className="sticky top-0 z-50 border-rule border-b bg-paper/90 backdrop-blur-sm">
			<nav
				aria-label="Primary"
				className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3.5 md:px-10"
			>
				{/* Logo */}
				<a
					className="group flex items-baseline gap-2.5 no-underline"
					href="#top"
				>
					<span className="font-display text-xl tracking-tight transition-colors group-hover:text-stamp">
						Clarity
					</span>
					<span className="rubric text-ink-faint transition-colors group-hover:text-stamp">
						Payroll
					</span>
				</a>

				<span
					aria-hidden="true"
					className="hidden h-4 w-px bg-rule sm:block"
				/>

				<span className="rubric hidden text-ink-faint sm:block">
					{RULE_PACK.id}
				</span>

				{/* Desktop nav */}
				<ul className="ml-auto hidden list-none items-center gap-7 p-0 lg:flex">
					{NAV_LINKS.map((link) => (
						<li key={link.id}>
							<a
								className="rubric text-ink-muted no-underline transition-colors hover:text-stamp"
								href={link.href}
							>
								{link.label}
							</a>
						</li>
					))}
				</ul>

				<a
					className="ml-auto rounded-sm border border-ink bg-ink px-4 py-2 font-medium text-[0.8rem] text-paper-card no-underline transition-colors hover:border-stamp hover:bg-stamp lg:ml-0"
					href="/"
				>
					Open the app
				</a>

				{/* Mobile hamburger */}
				<button
					aria-expanded={open}
					aria-label={open ? "Close menu" : "Open menu"}
					className="flex size-8 items-center justify-center rounded-sm border border-rule text-ink transition-colors hover:border-ink lg:hidden"
					onClick={() => setOpen((v) => !v)}
					type="button"
				>
					{open ? (
						<XIcon className="size-4" />
					) : (
						<MenuIcon className="size-4" />
					)}
				</button>
			</nav>

			{/* Mobile drawer */}
			{open && (
				<div className="border-rule border-t bg-paper-card px-6 py-5 lg:hidden">
					<ul className="flex list-none flex-col gap-1 p-0">
						{NAV_LINKS.map((link) => (
							<li key={link.id}>
								<a
									className="block rounded-sm px-3 py-2.5 text-ink text-sm no-underline transition-colors hover:bg-paper-deep hover:text-stamp"
									href={link.href}
									onClick={() => setOpen(false)}
								>
									{link.label}
								</a>
							</li>
						))}
					</ul>
					<div className="mt-4 border-rule border-t pt-4">
						<a
							className="block rounded-sm border border-ink bg-ink px-4 py-2.5 text-center font-medium text-[0.85rem] text-paper-card no-underline transition-colors hover:border-stamp hover:bg-stamp"
							href="/"
						>
							Open the app
						</a>
					</div>
				</div>
			)}
		</header>
	);
}
