"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { appLinks } from "@/data/product";
import { getLenis, scrollToTarget } from "@/lib/scroll";

const navLinks = [
	{ href: "/kontinue-model", label: "K-AI 1.0" },
	{ href: "/import-ai-conversations", label: "Import" },
	{ href: "/supported-models", label: "Models" },
	{ href: "/pricing", label: "Pricing" },
	{ href: "/blog", label: "Blog" },
	{ href: "/about", label: "About" },
];

export function Header() {
	const pathname = usePathname();
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

	useEffect(() => {
		if (!mobileOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setMobileOpen(false);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [mobileOpen]);

	const handleNav = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
		const id = href.includes("#") ? href.split("#")[1] : undefined;
		const el =
			id && typeof document !== "undefined"
				? document.getElementById(id)
				: null;
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
						style={{ filter: "brightness(0)", width: "auto" }}
						priority
					/>
				</Link>

				<nav className="hidden items-center gap-9 lg:flex">
					{navLinks.map((link) => (
						<Link
							key={link.href}
							href={link.href}
							onClick={(e) => handleNav(e, link.href)}
							aria-current={pathname === link.href ? "page" : undefined}
							className={`link-underline text-sm font-medium transition-colors hover:text-foreground ${pathname === link.href ? "text-foreground" : "text-muted-foreground"}`}
						>
							{link.label}
						</Link>
					))}
				</nav>

				<div className="hidden items-center gap-2 lg:flex">
					<Button asChild variant="ghost" size="sm">
						<Link
							href={appLinks.signIn}
							target="_blank"
							rel="noopener noreferrer"
						>
							Sign in
						</Link>
					</Button>
					<Button asChild size="sm">
						<Link
							href={appLinks.signUp}
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
								key={`m-${link.href}`}
								href={link.href}
								onClick={(e) => handleNav(e, link.href)}
								aria-current={pathname === link.href ? "page" : undefined}
								className={`font-display border-b border-border py-5 text-2xl tracking-tight transition-colors hover:text-brand ${pathname === link.href ? "text-brand" : "text-foreground"}`}
							>
								{link.label}
							</Link>
						))}
					</div>
					<div className="mt-auto flex flex-col gap-3 pt-10">
						<Button asChild variant="outline" size="lg" className="w-full">
							<Link
								href={appLinks.signIn}
								target="_blank"
								rel="noopener noreferrer"
							>
								Sign in
							</Link>
						</Button>
						<Button asChild size="lg" className="w-full">
							<Link
								href={appLinks.signUp}
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
