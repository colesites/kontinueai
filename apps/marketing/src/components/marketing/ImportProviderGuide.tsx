import Image from "next/image";
import Link from "next/link";
import {
	ContentSection,
	FAQList,
	NumberedGrid,
	PageHero,
	ProductCTA,
} from "@/components/marketing/PagePrimitives";
import type { ImportSource } from "@/data/product";
import { appLinks } from "@/data/product";

export function ImportProviderGuide({
	source,
	title,
	description,
	intro,
	steps,
	troubleshooting,
}: {
	source: ImportSource;
	title: string;
	description: string;
	intro: string;
	steps: Array<{ title: string; description: string }>;
	troubleshooting: Array<{ question: string; answer: string }>;
}) {
	return (
		<>
			<PageHero
				eyebrow={`${source.name} import guide`}
				title={title}
				description={description}
				primary={{
					label: "Start an import",
					href: appLinks.import,
					eventName: "import_page_cta_clicked",
				}}
				secondary={{
					label: "All import methods",
					href: "/import-ai-conversations",
				}}
				breadcrumbs={[
					{ name: "Home", href: "/" },
					{ name: "Import conversations", href: "/import-ai-conversations" },
					{
						name: source.name,
						href: source.guidePath ?? "/import-ai-conversations",
					},
				]}
			>
				<div className="mt-12 flex max-w-2xl items-center gap-4 rounded-2xl border border-border bg-card p-5 card-shadow">
					{source.logo ? (
						<Image
							src={source.logo}
							alt=""
							width={36}
							height={36}
							className="size-9 object-contain"
						/>
					) : null}
					<div>
						<p className="font-display text-lg">
							{source.name} support is available
						</p>
						<p className="mt-1 text-sm text-muted-foreground">
							{source.methods.join(" and ")}
						</p>
					</div>
				</div>
			</PageHero>

			<ContentSection
				eyebrow="Before you begin"
				title={`How ${source.name} importing works`}
				description={intro}
			>
				<NumberedGrid items={steps} />
			</ContentSection>

			<ContentSection
				tone="muted"
				eyebrow="What transfers"
				title="Keep the useful conversation structure"
				description="Kontinue AI prepares supported content as an ordered conversation. Rich content and provider-specific features may not transfer completely."
			>
				<div className="mt-12 grid gap-5 md:grid-cols-2">
					<div className="rounded-[1.4rem] border border-border bg-card p-7 sm:p-8">
						<h3 className="font-display text-2xl">Preserved when available</h3>
						<ul className="mt-5 space-y-3 text-muted-foreground">
							{source.preserves.map((item) => (
								<li key={item} className="flex gap-3">
									<span className="text-brand">•</span>
									{item}
								</li>
							))}
						</ul>
					</div>
					<div className="rounded-[1.4rem] border border-border bg-card p-7 sm:p-8">
						<h3 className="font-display text-2xl">Known limitation</h3>
						<p className="mt-5 leading-relaxed text-muted-foreground">
							{source.limitations}
						</p>
						<Link
							href="/security"
							className="link-underline mt-6 inline-block text-sm font-medium text-brand-strong"
						>
							How imported data is handled
						</Link>
					</div>
				</div>
			</ContentSection>

			<FAQList
				items={troubleshooting}
				title={`${source.name} import questions`}
			/>
			<ProductCTA
				title={`Bring your ${source.name} conversation into Kontinue AI.`}
				description="Continue with K-AI 1.0 or another supported model after the import is ready."
				eventName="import_page_signup_clicked"
			/>
		</>
	);
}
