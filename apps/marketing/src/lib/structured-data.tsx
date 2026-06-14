export const SITE_URL = "https://kontinueai.com";
export const APP_URL = "https://chat.kontinueai.com";

const SUMMARY =
	"Kontinue AI brings ChatGPT, Claude, Gemini, Perplexity, Grok and more into one workspace. Import any chat, switch models without losing context, and pay for one plan instead of five.";

export const organizationSchema = {
	"@context": "https://schema.org",
	"@type": "Organization",
	"@id": `${SITE_URL}/#organization`,
	name: "Kontinue AI",
	url: SITE_URL,
	logo: `${SITE_URL}/kontinueai-icon.png`,
	description: SUMMARY,
	contactPoint: {
		"@type": "ContactPoint",
		email: "support@kontinueai.com",
		contactType: "customer support",
	},
};

export const websiteSchema = {
	"@context": "https://schema.org",
	"@type": "WebSite",
	"@id": `${SITE_URL}/#website`,
	name: "Kontinue AI",
	url: SITE_URL,
	publisher: { "@id": `${SITE_URL}/#organization` },
};

export const softwareSchema = {
	"@context": "https://schema.org",
	"@type": "SoftwareApplication",
	name: "Kontinue AI",
	applicationCategory: "BusinessApplication",
	operatingSystem: "Web, iOS, Android",
	url: SITE_URL,
	description: SUMMARY,
	offers: [
		{
			"@type": "Offer",
			name: "Free",
			price: "0",
			priceCurrency: "USD",
		},
		{
			"@type": "Offer",
			name: "Starter",
			price: "8.99",
			priceCurrency: "USD",
		},
		{
			"@type": "Offer",
			name: "Pro",
			price: "50",
			priceCurrency: "USD",
		},
	],
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

export function JsonLd({ data }: { data: object }) {
	return (
		<script
			type="application/ld+json"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: static, server-rendered JSON-LD
			dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
		/>
	);
}
