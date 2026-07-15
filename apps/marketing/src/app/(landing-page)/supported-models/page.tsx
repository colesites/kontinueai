import type { Metadata } from "next";
import Image from "next/image";
import {
	ContentSection,
	PageHero,
	ProductCTA,
} from "@/components/marketing/PagePrimitives";
import { supportedModelGroups } from "@/data/product";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
	title: "Supported AI Models on Kontinue AI",
	description:
		"Explore K-AI 1.0 and supported models from leading AI providers available through one AI platform.",
	path: "/supported-models",
});

export default function SupportedModelsPage() {
	return (
		<>
			<PageHero
				eyebrow="Model catalogue"
				title="K-AI 1.0 first. Leading AI models alongside it."
				description="We built our own native intelligence layer and also provide selected models from external providers. Availability can depend on your plan and can change as providers update their catalogues."
				primary={{
					label: "Start free",
					href: "https://chat.kontinueai.com/sign-up",
					eventName: "models_signup_clicked",
				}}
				secondary={{ label: "Compare plans", href: "/pricing" }}
				breadcrumbs={[
					{ name: "Home", href: "/" },
					{ name: "Supported models", href: "/supported-models" },
				]}
			/>

			<ContentSection
				eyebrow="Current providers"
				title="A growing selection of supported models"
				description="Our model picker is the live source for individual model versions. Here we show the provider groups we currently support and our native Kontinue option without promising every model from every provider."
			>
				<div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
					{supportedModelGroups.map((model) => (
						<article
							key={model.id}
							className={`rounded-[1.4rem] border p-7 ${model.category === "Kontinue native" ? "border-brand/35 bg-brand-tint/50 ring-1 ring-brand/10" : "border-border bg-card"}`}
						>
							<div className="flex items-center gap-3">
								{model.logo ? (
									<span className="grid size-10 place-items-center rounded-xl border border-border bg-background">
										<Image
											src={model.logo}
											alt=""
											width={22}
											height={22}
											className="size-5.5 object-contain"
										/>
									</span>
								) : (
									<span className="grid size-10 place-items-center rounded-xl bg-secondary font-display text-sm">
										{model.provider.slice(0, 1)}
									</span>
								)}
								<div>
									<p className="font-display text-xl">{model.displayName}</p>
									<p className="text-xs text-muted-foreground">
										{model.provider}
									</p>
								</div>
							</div>
							<dl className="mt-6 space-y-4 text-sm">
								<div>
									<dt className="font-medium">Best suited for</dt>
									<dd className="mt-1 leading-relaxed text-muted-foreground">
										{model.bestSuitedFor}
									</dd>
								</div>
								<div>
									<dt className="font-medium">Availability</dt>
									<dd className="mt-1 text-muted-foreground">
										{model.availability}
									</dd>
								</div>
								<div>
									<dt className="font-medium">Plan</dt>
									<dd className="mt-1 text-muted-foreground">
										{model.planRequirement}
									</dd>
								</div>
							</dl>
							<div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
								<span>{model.status}</span>
								<span>Reviewed {model.lastReviewed}</span>
							</div>
						</article>
					))}
				</div>
			</ContentSection>
			<ProductCTA
				title="Choose the model that fits the next step."
				description="Start with K-AI 1.0, then use supported models available on your plan when you need another capability."
				eventName="models_final_signup_clicked"
			/>
		</>
	);
}
