import { Download } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
	ContentSection,
	PageHero,
} from "@/components/marketing/PagePrimitives";
import { product } from "@/data/product";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
	title: "Kontinue AI Press and Company Information",
	description:
		"Official descriptions, verified company facts, founder information, logos and product assets for Kontinue AI.",
	path: "/press",
});

export default function PressPage() {
	return (
		<>
			<PageHero
				eyebrow="Press and entity information"
				title="Official Kontinue AI company facts and assets."
				description="Use the descriptions and downloadable assets on this page when writing about Kontinue AI. Missing facts are intentionally left unpublished rather than guessed."
				breadcrumbs={[
					{ name: "Home", href: "/" },
					{ name: "Press", href: "/press" },
				]}
			/>

			<ContentSection
				eyebrow="Company descriptions"
				title="Approved positioning copy"
			>
				<div className="mt-12 grid gap-5 lg:grid-cols-2">
					<article className="rounded-[1.4rem] border border-border bg-card p-7">
						<p className="eyebrow">Short description</p>
						<p className="mt-5 text-lg leading-relaxed">
							{product.positioning.short}
						</p>
					</article>
					<article className="rounded-[1.4rem] border border-border bg-card p-7">
						<p className="eyebrow">Long description</p>
						<p className="mt-5 leading-relaxed text-muted-foreground">
							{product.positioning.long}
						</p>
					</article>
				</div>
			</ContentSection>

			<ContentSection
				tone="muted"
				eyebrow="Founder"
				title={product.company.founder.name}
				description="Founder of Kontinue AI. We will add a longer biography, official social profiles, and a press portrait when they are ready."
			>
				<Link
					href="/authors/aderibigbe-adedamola"
					className="link-underline mt-8 inline-block font-medium text-brand-strong"
				>
					Founder and author profile
				</Link>
			</ContentSection>

			<ContentSection
				eyebrow="Brand assets"
				title="Download existing Kontinue AI assets"
				description="These files already belong to the project. Do not alter the wordmark proportions or recolour it without approval."
			>
				<div className="mt-12 grid gap-5 sm:grid-cols-3">
					{[
						{
							href: "/kontinueai.svg",
							label: "Wordmark (SVG)",
							image: "/kontinueai.svg",
						},
						{
							href: "/kontinueai-icon.png",
							label: "App icon (PNG)",
							image: "/kontinueai-icon.png",
						},
						{ href: "/og.png", label: "Social image (PNG)", image: "/og.png" },
					].map((asset) => (
						<a
							key={asset.href}
							href={asset.href}
							download
							className="group rounded-[1.4rem] border border-border bg-card p-5"
						>
							<div className="relative grid aspect-video place-items-center overflow-hidden rounded-xl bg-secondary p-5">
								<Image
									src={asset.image}
									alt={asset.label}
									width={asset.href.endsWith("og.png") ? 280 : 160}
									height={asset.href.endsWith("og.png") ? 147 : 60}
									className="max-h-full max-w-full object-contain"
								/>
							</div>
							<span className="mt-4 flex items-center justify-between text-sm font-medium">
								{asset.label}
								<Download className="size-4 text-muted-foreground transition group-hover:text-brand" />
							</span>
						</a>
					))}
				</div>
			</ContentSection>

			<ContentSection
				tone="dark"
				eyebrow="Verified facts"
				title="What can be stated today"
			>
				<dl className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{[
						["Company", product.company.name],
						["Category", product.company.productCategory],
						["Founder", product.company.founder.name],
						["Market", product.company.market],
						["Native option", product.nativeModel.name],
						["Website", product.company.website],
						["Press contact", product.company.email.press],
					].map(([label, value]) => (
						<div
							key={label}
							className="rounded-2xl border border-background/10 bg-background/[0.05] p-5"
						>
							<dt className="font-mono text-[0.65rem] uppercase tracking-widest text-background/45">
								{label}
							</dt>
							<dd className="mt-3 text-sm leading-relaxed text-background/80">
								{value}
							</dd>
						</div>
					))}
				</dl>
				<p className="mt-8 max-w-2xl text-sm leading-relaxed text-background/60">
					We have not published a funding amount, founding date, headquarters
					address, awards, partnerships, customer list, benchmark ranking, or
					independent press coverage because we do not yet have verified details
					for them.
				</p>
			</ContentSection>
		</>
	);
}
