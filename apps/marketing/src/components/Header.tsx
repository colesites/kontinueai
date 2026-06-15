"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getLenis, scrollToTarget } from "@/lib/scroll";
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

	// Lock scrolling (native + Lenis) while the full-screen menu is open.
	useEffect(() => {
		const lenis = getLenis();
		if (mobileOpen) {
			lenis?.stop();
			document.body.style.overflow = "hidden";
		} else {
			lenis?.start();
			document.body.style.overflow = "";
		}
		return () => {
			lenis?.start();
			document.body.style.overflow = "";
		};
	}, [mobileOpen]);

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
				mobileOpen
					? "border-b border-border bg-background"
					: scrolled
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
					className={`relative z-10 inline-flex size-10 items-center justify-center rounded-full text-foreground transition-colors lg:hidden ${
						mobileOpen ? "bg-accent" : "hover:bg-accent"
					}`}
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
				className={`fixed inset-x-0 bottom-0 top-16 bg-background transition-opacity duration-300 lg:hidden ${
					mobileOpen
						? "visible opacity-100"
						: "invisible opacity-0 pointer-events-none"
				}`}
			>
				<nav className="flex h-full flex-col overflow-y-auto px-5 pt-2 pb-10">
					<div className="flex flex-col">
						{navLinks.map((link) => (
							<Link
								key={`m-${link.id}`}
								href={link.href}
								onClick={(e) => handleNav(e, link.id)}
								className="font-display border-b border-border py-5 text-2xl tracking-tight text-foreground transition-colors hover:text-brand"
							>
								{link.label}
							</Link>
						))}
					</div>
					<div className="mt-auto flex flex-col gap-3 pt-10">
						<Button asChild variant="outline" size="lg" className="w-full">
							<Link
								href={`${APP_URL}/sign-in`}
								target="_blank"
								rel="noopener noreferrer"
							>
								Sign in
							</Link>
						</Button>
						<Button asChild size="lg" className="w-full">
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
