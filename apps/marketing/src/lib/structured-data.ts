import { plans, product } from "@/data/product";
import { APP_URL, DEFAULT_OG_IMAGE, SITE_URL } from "@/lib/metadata";

export { APP_URL, SITE_URL };

export const founderSchema = {
	"@type": "Person",
	"@id": `${SITE_URL}/authors/aderibigbe-adedamola#person`,
	name: product.company.founder.name,
	jobTitle: product.company.founder.role,
};

export const organizationSchema = {
	"@context": "https://schema.org",
	"@type": "Organization",
	"@id": `${SITE_URL}/#organization`,
	name: product.company.name,
	url: SITE_URL,
	logo: `${SITE_URL}/kontinueai-icon.png`,
	description: product.positioning.short,
	foundingLocation: {
		"@type": "Country",
		name: product.company.countryOfOrigin,
	},
	founder: founderSchema,
	contactPoint: {
		"@type": "ContactPoint",
		email: product.company.email.support,
		contactType: "customer support",
	},
};

export const websiteSchema = {
	"@context": "https://schema.org",
	"@type": "WebSite",
	"@id": `${SITE_URL}/#website`,
	name: product.company.name,
	url: SITE_URL,
	description: product.positioning.short,
	publisher: { "@id": `${SITE_URL}/#organization` },
};

export const softwareSchema = {
	"@context": "https://schema.org",
	"@type": "SoftwareApplication",
	"@id": `${SITE_URL}/#software`,
	name: product.company.name,
	applicationCategory: "BusinessApplication",
	operatingSystem: "Web",
	url: SITE_URL,
	description: product.positioning.long,
	featureList: [
		"K-AI 1.0 native intelligence layer",
		"Import supported AI conversations",
		"Continue conversations with preserved message context",
		"Access selected models from leading AI providers",
	],
	offers: plans.map((plan) => ({
		"@type": "Offer",
		name: plan.name,
		price: String(plan.monthlyPriceUsd),
		priceCurrency: "USD",
		url: `${SITE_URL}/pricing`,
	})),
	publisher: { "@id": `${SITE_URL}/#organization` },
};

export function faqSchema(items: { question: string; answer: string }[]) {
	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: items.map((item) => ({
			"@type": "Question",
			name: item.question,
			acceptedAnswer: {
				"@type": "Answer",
				text: item.answer,
			},
		})),
	};
}

export function breadcrumbSchema(items: Array<{ name: string; href: string }>) {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: items.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			item: new URL(item.href, SITE_URL).toString(),
		})),
	};
}

export function blogSchema() {
	return {
		"@context": "https://schema.org",
		"@type": "Blog",
		"@id": `${SITE_URL}/blog#blog`,
		name: "The Kontinue Journal",
		url: `${SITE_URL}/blog`,
		description:
			"Product notes, engineering stories, model guides, tutorials, research, and company updates from Kontinue AI.",
		publisher: { "@id": `${SITE_URL}/#organization` },
	};
}

export function articleSchema({
	title,
	description,
	path,
	image,
	authorName,
	authorSlug,
	publishedAt,
	modifiedAt,
}: {
	title: string;
	description?: string;
	path: string;
	image?: string;
	authorName: string;
	authorSlug?: string;
	publishedAt?: string;
	modifiedAt?: string;
}) {
	return {
		"@context": "https://schema.org",
		"@type": "BlogPosting",
		mainEntityOfPage: `${SITE_URL}${path}`,
		headline: title,
		description,
		image: image ? [image] : [new URL(DEFAULT_OG_IMAGE, SITE_URL).toString()],
		datePublished: publishedAt,
		dateModified: modifiedAt ?? publishedAt,
		author: {
			"@type": "Person",
			name: authorName,
			...(authorSlug ? { url: `${SITE_URL}/authors/${authorSlug}` } : {}),
		},
		publisher: { "@id": `${SITE_URL}/#organization` },
	};
}
