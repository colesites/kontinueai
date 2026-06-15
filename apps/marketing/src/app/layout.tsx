import { GoogleTagManager } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import {
	Bricolage_Grotesque,
	Hanken_Grotesk,
	JetBrains_Mono,
} from "next/font/google";
import { BottomBlur } from "@/components/BottomBlur";
import { SmoothScroll } from "@/components/SmoothScroll";
import {
	JsonLd,
	organizationSchema,
	SITE_URL,
	softwareSchema,
	websiteSchema,
} from "@/lib/structured-data";
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

const siteTitle = "Kontinue AI: One workspace for every AI model";
const siteDescription =
	"Import your chats from ChatGPT, Claude, Gemini, Perplexity, Grok and more, switch models without losing context, and pay for one plan instead of five.";

export const metadata: Metadata = {
	metadataBase: new URL(SITE_URL),
	title: {
		default: siteTitle,
		template: "%s | Kontinue AI",
	},
	description: siteDescription,
	applicationName: "Kontinue AI",
	authors: [{ name: "Kontinue AI" }],
	creator: "Kontinue AI",
	publisher: "Kontinue AI",
	category: "technology",
	alternates: {
		canonical: "/",
	},
	keywords: [
		"Kontinue AI",
		"kontinueai",
		"multi model AI workspace",
		"AI model switcher",
		"import ChatGPT chat",
		"import Claude chat",
		"one plan for every AI model",
		"continue AI conversation after limit",
		"compare AI models",
	],
	openGraph: {
		title: siteTitle,
		description: siteDescription,
		url: "/",
		siteName: "Kontinue AI",
		images: [
			{
				url: "/og.png?v=2",
				width: 1200,
				height: 630,
				alt: "Kontinue AI: one workspace for every AI model",
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
		images: ["/og.png?v=2"],
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
				<GoogleTagManager gtmId={process.env.GTM || ""} />
				<JsonLd data={organizationSchema} />
				<JsonLd data={websiteSchema} />
				<JsonLd data={softwareSchema} />
				<SmoothScroll>{children}</SmoothScroll>
				<BottomBlur />
				<Analytics />
			</body>
		</html>
	);
}
