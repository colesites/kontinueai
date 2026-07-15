import type { Metadata } from "next";
import { product } from "@/data/product";

export const SITE_URL = product.company.website;
export const APP_URL = product.company.appUrl;
export const DEFAULT_OG_IMAGE = "/og.png?v=3";

export function pageMetadata({
	title,
	description,
	path,
	type = "website",
	image = DEFAULT_OG_IMAGE,
	imageAlt = title,
	noIndex = false,
}: {
	title: string;
	description: string;
	path: string;
	type?: "website" | "article";
	image?: string;
	imageAlt?: string;
	noIndex?: boolean;
}): Metadata {
	const canonical = path === "/" ? "/" : path.replace(/\/$/, "");
	return {
		title: { absolute: title },
		description,
		alternates: { canonical },
		openGraph: {
			title,
			description,
			url: canonical,
			type,
			siteName: product.company.name,
			images: [
				{
					url: image,
					width: 1200,
					height: 630,
					alt: imageAlt,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
			images: [image],
		},
		robots: noIndex
			? { index: false, follow: false }
			: {
					index: true,
					follow: true,
					googleBot: {
						index: true,
						follow: true,
						"max-image-preview": "large",
						"max-snippet": -1,
						"max-video-preview": -1,
					},
				},
	};
}
