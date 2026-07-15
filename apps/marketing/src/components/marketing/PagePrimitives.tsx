import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/marketing/JsonLd";
import { TrackedLink } from "@/components/marketing/TrackedLink";
import { appLinks } from "@/data/product";
import { breadcrumbSchema, faqSchema } from "@/lib/structured-data";

export function Breadcrumbs({
	items,
}: {
	items: Array<{ name: string; href: string }>;
}) {
	return (
		<>
			<JsonLd data={breadcrumbSchema(items)} />
			<nav aria-label="Breadcrumb" className="mb-8">
				<ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					{items.map((item, index) => (
						<li key={item.href} className="flex items-center gap-2">
							{index > 0 ? <span aria-hidden>/</span> : null}
							{index === items.length - 1 ? (
								<span aria-current="page" className="text-foreground">
									{item.name}
								</span>
							) : (
								<Link className="link-underline" href={item.href}>
									{item.name}
								</Link>
							)}
						</li>
					))}
				</ol>
			</nav>
		</>
	);
}

export function PageHero({
	eyebrow,
	title,
	description,
	primary,
	secondary,
	children,
	breadcrumbs,
}: {
	eyebrow: string;
	title: string;
	description: string;
	primary?: { label: string; href: string; eventName: string };
	secondary?: { label: string; href: string };
	children?: ReactNode;
	breadcrumbs?: Array<{ name: string; href: string }>;
}) {
	return (
		<section className="bg-noise relative overflow-hidden px-5 pt-32 pb-20 lg:px-8 lg:pt-40 lg:pb-28">
			<div
				aria-hidden
				className="bg-grid mask-fade-edges pointer-events-none absolute inset-0 opacity-60"
			/>
			<div className="relative mx-auto max-w-6xl">
				{breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
				<div className="max-w-4xl">
					<p className="eyebrow inline-flex items-center gap-2 text-brand-strong">
						<span className="size-1.5 rounded-full bg-brand" />
						{eyebrow}
					</p>
					<h1 className="font-display tracking-tightest mt-6 text-[2.75rem] leading-[1.01] sm:text-6xl lg:text-[4.6rem]">
						{title}
					</h1>
					<p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
						{description}
					</p>
					{primary || secondary ? (
						<div className="mt-9 flex flex-col gap-3 sm:flex-row">
							{primary ? (
								<TrackedLink
									href={primary.href}
									eventName={primary.eventName}
									size="lg"
									className="w-full sm:w-auto"
									target={
										primary.href.startsWith("http") ? "_blank" : undefined
									}
									rel={
										primary.href.startsWith("http")
											? "noopener noreferrer"
											: undefined
									}
								>
									{primary.label}
								</TrackedLink>
							) : null}
							{secondary ? (
								<Link
									href={secondary.href}
									className="inline-flex h-[3.25rem] w-full items-center justify-center gap-2 rounded-full border border-border-strong bg-card px-8 text-base font-medium transition hover:bg-accent sm:w-auto"
								>
									{secondary.label}
									<ArrowRight className="size-4" />
								</Link>
							) : null}
						</div>
					) : null}
				</div>
				{children}
			</div>
		</section>
	);
}

export function ContentSection({
	id,
	eyebrow,
	title,
	description,
	children,
	tone = "plain",
	centered = false,
}: {
	id?: string;
	eyebrow?: string;
	title: string;
	description?: string;
	children?: ReactNode;
	tone?: "plain" | "muted" | "dark";
	centered?: boolean;
}) {
	return (
		<section
			id={id}
			className={
				tone === "dark"
					? "bg-foreground py-24 text-background lg:py-32"
					: tone === "muted"
						? "border-y border-border bg-secondary/45 py-24 lg:py-32"
						: "bg-background py-24 lg:py-32"
			}
		>
			<div className="mx-auto max-w-6xl px-5 lg:px-8">
				<div className={`max-w-3xl ${centered ? "mx-auto text-center" : ""}`}>
					{eyebrow ? (
						<p
							className={
								tone === "dark" ? "eyebrow text-background/55" : "eyebrow"
							}
						>
							{eyebrow}
						</p>
					) : null}
					<h2 className="font-display tracking-tightest mt-5 text-4xl leading-[1.06] sm:text-5xl">
						{title}
					</h2>
					{description ? (
						<p
							className={
								tone === "dark"
									? "mt-6 text-lg leading-relaxed text-background/70"
									: "mt-6 text-lg leading-relaxed text-muted-foreground"
							}
						>
							{description}
						</p>
					) : null}
				</div>
				{children}
			</div>
		</section>
	);
}

export function NumberedGrid({
	items,
	columns = 3,
}: {
	items: Array<{ title: string; description: string; meta?: string }>;
	columns?: 2 | 3;
}) {
	return (
		<div
			className={`mt-14 grid gap-5 ${columns === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}
		>
			{items.map((item, index) => (
				<article
					key={item.title}
					className="rounded-[1.4rem] border border-border bg-card p-7 card-shadow sm:p-8"
				>
					<div className="flex items-center justify-between gap-4">
						<span className="font-mono text-xs text-brand">
							{String(index + 1).padStart(2, "0")}
						</span>
						{item.meta ? (
							<span className="text-xs text-muted-foreground">{item.meta}</span>
						) : null}
					</div>
					<h3 className="font-display mt-8 text-2xl tracking-tight">
						{item.title}
					</h3>
					<p className="mt-4 leading-relaxed text-muted-foreground">
						{item.description}
					</p>
				</article>
			))}
		</div>
	);
}

export function FAQList({
	items,
	title = "Questions, answered",
	centered = false,
}: {
	items: Array<{ question: string; answer: string }>;
	title?: string;
	centered?: boolean;
}) {
	return (
		<ContentSection eyebrow="FAQ" title={title} centered={centered}>
			<JsonLd data={faqSchema(items)} />
			<div
				className={`mt-14 max-w-3xl border-t border-border ${centered ? "mx-auto text-left" : ""}`}
			>
				{items.map((item, index) => (
					<details
						key={item.question}
						className="group border-b border-border"
						open={index === 0}
					>
						<summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 font-display text-lg tracking-tight marker:hidden sm:text-xl">
							{item.question}
							<span
								aria-hidden
								className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-base group-open:rotate-45"
							>
								+
							</span>
						</summary>
						<p className="max-w-2xl pb-6 pr-10 leading-relaxed text-muted-foreground">
							{item.answer}
						</p>
					</details>
				))}
			</div>
		</ContentSection>
	);
}

export function ProductCTA({
	title,
	description,
	eventName = "signup_started",
}: {
	title: string;
	description: string;
	eventName?: string;
}) {
	return (
		<section className="bg-background pb-24 lg:pb-32">
			<div className="mx-auto max-w-6xl px-5 lg:px-8">
				<div className="bg-noise relative overflow-hidden rounded-[2rem] bg-foreground px-6 py-16 text-center text-background sm:px-12 sm:py-24">
					<div
						aria-hidden
						className="bg-grid mask-fade-edges pointer-events-none absolute inset-0 opacity-[0.12] invert"
					/>
					<div className="relative">
						<p className="eyebrow text-background/55">
							Continue with Kontinue AI
						</p>
						<h2 className="font-display tracking-tightest mx-auto mt-5 max-w-3xl text-4xl leading-[1.05] sm:text-6xl">
							{title}
						</h2>
						<p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-background/70">
							{description}
						</p>
						<div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
							<TrackedLink
								href={appLinks.signUp}
								target="_blank"
								rel="noopener noreferrer"
								eventName={eventName}
								eventProperties={{ location: "page_cta" }}
								variant="brand"
								size="lg"
							>
								Start free
							</TrackedLink>
							<Link
								href="/pricing"
								className="inline-flex h-[3.25rem] items-center justify-center rounded-full border border-background/25 px-8 font-medium text-background transition hover:bg-background/10"
							>
								Compare plans
							</Link>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
