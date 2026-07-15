import { GoogleTagManager } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import {
	Bricolage_Grotesque,
	Hanken_Grotesk,
	JetBrains_Mono,
} from "next/font/google";
import { BottomBlur } from "@/components/BottomBlur";
import { JsonLd } from "@/components/marketing/JsonLd";
import { SmoothScroll } from "@/components/SmoothScroll";
import { product } from "@/data/product";
import { DEFAULT_OG_IMAGE, SITE_URL } from "@/lib/metadata";
import { organizationSchema, websiteSchema } from "@/lib/structured-data";
import "./globals.css";

const display = Bricolage_Grotesque({
	variable: "--font-ui-display",
	subsets: ["latin"],
	display: "swap",
});

const body = Hanken_Grotesk({
	variable: "--font-ui-body",
	subsets: ["latin"],
	display: "swap",
});

const mono = JetBrains_Mono({
	variable: "--font-ui-mono",
	subsets: ["latin"],
	weight: ["400", "500"],
	display: "swap",
});

const siteTitle = "Kontinue AI | African-Built Multi-Model AI Platform";
const siteDescription =
	"Use Kontinue AI’s own native intelligence layer, access leading AI models and import existing conversations with their context. Built in Africa for the world.";

export const metadata: Metadata = {
	metadataBase: new URL(SITE_URL),
	title: {
		default: siteTitle,
		template: "%s | Kontinue AI",
	},
	description: siteDescription,
	applicationName: "Kontinue AI",
	authors: [{ name: product.company.name }],
	creator: "Kontinue AI",
	publisher: "Kontinue AI",
	category: "technology",
	alternates: {
		canonical: "/",
	},
	keywords: [
		"Kontinue AI",
		"kontinueai",
		"African-built AI platform",
		"Nigerian AI company",
		"K-AI 1.0",
		"import AI conversations",
		"multi-model AI platform",
		"continue AI conversation after limit",
		"portable AI conversations",
	],
	openGraph: {
		title: siteTitle,
		description: siteDescription,
		url: "/",
		siteName: "Kontinue AI",
		images: [
			{
				url: DEFAULT_OG_IMAGE,
				width: 1200,
				height: 630,
				alt: "Kontinue AI — built in Africa for the world",
				type: "image/png",
			},
		],
		locale: "en_US",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: siteTitle,
		description: siteDescription,
		images: [DEFAULT_OG_IMAGE],
	},
	icons: {
		icon: "/favicon.ico",
		shortcut: "/favicon.ico",
		apple: "/favicon.ico",
	},
	robots: {
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

export const viewport: Viewport = {
	themeColor: "#fafaf6",
	colorScheme: "light",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className={`${body.variable} ${display.variable} ${mono.variable} antialiased`}
			>
				{/* Flag JS presence before paint so scroll-reveal elements start hidden. */}
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: tiny inline bootstrap flag, no dynamic data
					dangerouslySetInnerHTML={{
						__html: "document.documentElement.classList.add('gsap')",
					}}
				/>
				{process.env.GTM ? <GoogleTagManager gtmId={process.env.GTM} /> : null}
				<JsonLd data={organizationSchema} />
				<JsonLd data={websiteSchema} />
				<SmoothScroll>{children}</SmoothScroll>
				<BottomBlur />
				<Analytics />
			</body>
		</html>
	);
}
