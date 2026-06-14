"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { scrollToTarget } from "@/lib/scroll";
import { APP_URL } from "@/lib/structured-data";

const navLinks = [
	{ href: "/#how-it-works", id: "how-it-works", label: "How it works" },
	{ href: "/#features", id: "features", label: "Features" },
	{ href: "/#pricing", id: "pricing", label: "Pricing" },
	{ href: "/download", id: "download", label: "Download" },
	{ href: "/#faq", id: "faq", label: "FAQ" },
];

export function Header() {
	const [scrolled, setScrolled] = useState(false);
	const [mobileOpen, setMobileOpen] = useState(false);

	useEffect(() => {
		const onScroll = () => setScrolled(window.scrollY > 16);
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	const handleNav = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
		const el =
			typeof document !== "undefined" ? document.getElementById(id) : null;
		if (el) {
			e.preventDefault();
			scrollToTarget(`#${id}`);
		}
		setMobileOpen(false);
	};

	return (
		<header
			className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
				scrolled
					? "border-b border-border bg-background/80 backdrop-blur-xl"
					: "border-b border-transparent"
			}`}
		>
			<div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 lg:px-8">
				<Link
					href="/"
					aria-label="Kontinue AI home"
					className="flex shrink-0 items-center"
				>
					<Image
						src="/kontinueai.svg"
						alt="Kontinue AI"
						width={120}
						height={28}
						className="h-[1.35rem] w-auto object-contain"
						style={{ filter: "brightness(0)" }}
						priority
					/>
				</Link>

				<nav className="hidden items-center gap-9 lg:flex">
					{navLinks.map((link) => (
						<Link
							key={link.id}
							href={link.href}
							onClick={(e) => handleNav(e, link.id)}
							className="link-underline text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
						>
							{link.label}
						</Link>
					))}
				</nav>

				<div className="hidden items-center gap-2 lg:flex">
					<Button asChild variant="ghost" size="sm">
						<Link
							href={`${APP_URL}/sign-in`}
							target="_blank"
							rel="noopener noreferrer"
						>
							Sign in
						</Link>
					</Button>
					<Button asChild size="sm">
						<Link
							href={`${APP_URL}/sign-up`}
							target="_blank"
							rel="noopener noreferrer"
						>
							Get started
						</Link>
					</Button>
				</div>

				<button
					type="button"
					className="inline-flex size-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent lg:hidden"
					aria-expanded={mobileOpen}
					aria-controls="mobile-nav"
					aria-label={mobileOpen ? "Close menu" : "Open menu"}
					onClick={() => setMobileOpen((v) => !v)}
				>
					{mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
				</button>
			</div>

			<div
				id="mobile-nav"
				className={`overflow-hidden border-t border-border bg-background/95 backdrop-blur-xl transition-[max-height,opacity] duration-300 lg:hidden ${
					mobileOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
				}`}
			>
				<nav className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-4">
					{navLinks.map((link) => (
						<Link
							key={`m-${link.id}`}
							href={link.href}
							onClick={(e) => handleNav(e, link.id)}
							className="rounded-lg px-3 py-3 text-[0.95rem] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							{link.label}
						</Link>
					))}
					<div className="mt-2 flex flex-col gap-2 border-t border-border pt-4">
						<Button asChild variant="outline">
							<Link
								href={`${APP_URL}/sign-in`}
								target="_blank"
								rel="noopener noreferrer"
							>
								Sign in
							</Link>
						</Button>
						<Button asChild>
							<Link
								href={`${APP_URL}/sign-up`}
								target="_blank"
								rel="noopener noreferrer"
							>
								Get started
							</Link>
						</Button>
					</div>
				</nav>
			</div>
		</header>
	);
}
