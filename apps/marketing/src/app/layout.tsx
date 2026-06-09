import type { Metadata } from "next";
import { JetBrains_Mono, Syne, Urbanist } from "next/font/google";
import "./globals.css";
import { GoogleTagManager } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/next";

const display = Syne({
	variable: "--font-ui-display",
	subsets: ["latin"],
	weight: ["400", "500", "600", "700", "800"],
});

const body = Urbanist({
	variable: "--font-ui-body",
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
	variable: "--font-ui-mono",
	subsets: ["latin"],
	weight: ["400", "500", "600"],
});

const siteTitle = "Kontinue AI — One workspace for every AI model";
const siteDescription =
	"Import chats from ChatGPT, Claude, Gemini, Perplexity, Mistral, and more. Switch models instantly, compare answers, and pay for one plan.";

export const metadata: Metadata = {
	metadataBase: new URL("https://kontinueai.com"),
	title: {
		default: siteTitle,
		template: "%s — Kontinue AI",
	},
	description: siteDescription,
	applicationName: "Kontinue AI",
	authors: [{ name: "Kontinue AI" }],
	keywords: [
		"Kontinue AI",
		"kontinueai",
		"multi-model AI",
		"AI model switcher",
		"AI chat import",
		"ChatGPT import",
	],
	openGraph: {
		title: siteTitle,
		description: siteDescription,
		url: "/",
		siteName: "Kontinue AI",
		images: [
			{
				url: "/og.png",
				width: 1200,
				height: 630,
				alt: "Kontinue AI logo",
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
		images: ["/og.png"],
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

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className="light" suppressHydrationWarning>
			<body
				className={`${body.variable} ${display.variable} ${mono.variable} antialiased`}
			>
				<GoogleTagManager gtmId={process.env.GTM || ""} />
				{children}
				<Analytics />
			</body>
		</html>
	);
}
