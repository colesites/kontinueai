import Image from "next/image";
import Link from "next/link";
import { urlFor } from "@/sanity/lib/image";
import type { SanityImage } from "@/sanity/lib/types";
import { StripeField } from "./StripeField";

export function StoryCard({
	href,
	tag,
	meta,
	title,
	image,
}: {
	href: string;
	tag: string;
	meta: string;
	title: string;
	image?: SanityImage | null;
}) {
	return (
		<Link
			href={href}
			className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-border-strong"
		>
			{image ? (
				<div className="relative aspect-[16/9] overflow-hidden bg-secondary">
					<Image
						src={urlFor(image)
							.width(800)
							.height(450)
							.fit("crop")
							.auto("format")
							.url()}
						alt={image.alt || title}
						fill
						sizes="(max-width: 768px) 100vw, 33vw"
						placeholder={image.lqip ? "blur" : "empty"}
						blurDataURL={image.lqip}
						className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
					/>
				</div>
			) : (
				<StripeField label={tag} className="aspect-[16/9]" />
			)}
			<div className="p-6">
				<p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
					{meta}
				</p>
				<h3 className="font-display mt-3 text-xl leading-snug tracking-tight transition-colors group-hover:text-brand-strong">
					{title}
				</h3>
			</div>
		</Link>
	);
}
