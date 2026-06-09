"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const navLinks = [
	{ href: "/#features", label: "Features" },
	{ href: "/#use-cases", label: "Use cases" },
	{ href: "/#pricing", label: "Pricing" },
	{ href: "/#faq", label: "FAQ" },
];

export function Header() {
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

	const closeMobileMenu = () => setMobileMenuOpen(false);

	return (
		<header className="fixed top-0 left-0 right-0 z-50 pointer-events-none lg:sticky lg:top-4">
			<div className="mx-auto max-w-6xl px-4 pt-4 pb-2 pointer-events-auto">
				<div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-2 shadow-sm">
					{/* Logo */}
					<Link
						href="/"
						className="flex items-center font-display text-lg shrink-0"
					>
						<Image
							src="/kontinueai.svg"
							alt="Kontinue AI logo"
							width={120}
							height={32}
							className="h-6 w-auto object-contain"
							style={{ filter: "brightness(0)" }}
							priority
						/>
					</Link>

					{/* Desktop Nav */}
					<nav className="hidden lg:flex items-center gap-8 text-sm text-gray-600 font-medium">
						{navLinks.map((link) => (
							<Link
								key={link.href}
								href={link.href}
								className="hover:text-gray-900 transition-colors"
							>
								{link.label}
							</Link>
						))}
					</nav>

					{/* Desktop CTA */}
					<div className="hidden lg:flex items-center gap-3">
						<Link
							href="https://chat.kontinueai.com/sign-in"
							target="_blank"
							rel="noopener noreferrer"
							className="text-sm px-4 py-1.5 rounded-lg button-3d-white text-gray-700 hover:text-gray-900 transition-colors font-semibold"
						>
							Sign in
						</Link>
						<Button asChild size="sm" className="rounded-lg shadow-md">
							<Link
								href="https://chat.kontinueai.com/sign-up"
								target="_blank"
								rel="noopener noreferrer"
							>
								Sign up
							</Link>
						</Button>
					</div>

					{/* Mobile hamburger */}
					<button
						type="button"
						className="inline-flex size-10 items-center justify-center rounded-full text-gray-700 lg:hidden hover:bg-gray-100 transition-colors"
						aria-expanded={mobileMenuOpen}
						aria-controls="mobile-nav"
						aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
						onClick={() => setMobileMenuOpen((prev) => !prev)}
					>
						{mobileMenuOpen ? (
							<X className="size-5" />
						) : (
							<Menu className="size-5" />
						)}
					</button>
				</div>

				{/* Mobile Nav */}
				<div
					id="mobile-nav"
					className={`overflow-hidden transition-[max-height,opacity] duration-300 lg:hidden ${
						mobileMenuOpen ? "max-h-96 opacity-100 pt-3" : "max-h-0 opacity-0"
					}`}
				>
					<nav className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
						{navLinks.map((link) => (
							<Link
								key={`mobile-${link.href}`}
								href={link.href}
								onClick={closeMobileMenu}
								className="rounded-lg px-3 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 font-medium"
							>
								{link.label}
							</Link>
						))}
						<hr className="my-1 border-gray-100" />
						<Link
							href="https://chat.kontinueai.com/sign-in"
							target="_blank"
							rel="noopener noreferrer"
							onClick={closeMobileMenu}
							className="rounded-lg px-3 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 font-medium"
						>
							Sign in
						</Link>
						<Button asChild size="sm" className="mt-1">
							<Link
								href="https://chat.kontinueai.com/sign-up"
								target="_blank"
								rel="noopener noreferrer"
								onClick={closeMobileMenu}
							>
								Sign up
							</Link>
						</Button>
					</nav>
				</div>
			</div>
		</header>
	);
}
