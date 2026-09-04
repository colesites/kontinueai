import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Suspense } from "react";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://kontinueai.com";
const siteTitle = "Kontinue AI";
const siteDescription = "Continue your AI conversations from any platform";
const ogImage = "/og.png";

export const metadata: Metadata = {
	metadataBase: new URL(siteUrl),
	title: siteTitle,
	description: siteDescription,
	icons: {
		icon: "/favicon.ico",
	},
	openGraph: {
		type: "website",
		url: siteUrl,
		siteName: siteTitle,
		title: siteTitle,
		description: siteDescription,
		images: [
			{
				url: ogImage,
				width: 1200,
				height: 630,
				alt: siteTitle,
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: siteTitle,
		description: siteDescription,
		images: [ogImage],
	},
};

export const viewport: Viewport = {
	themeColor: "#0a0a0c",
	width: "device-width",
	initialScale: 1,
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<Script id="initialize-color-theme" strategy="beforeInteractive">
					{`
              (function() {
                try {
                  // next-themes only applies the light/dark class once its
                  // provider mounts, and every route renders a Suspense
                  // fallback ABOVE that provider. Without this the loading
                  // skeletons paint in light mode and flip when auth resolves.
                  var stored = localStorage.getItem('theme');
                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var mode = stored === 'light' || stored === 'dark'
                    ? stored
                    : (prefersDark ? 'dark' : 'light');
                  document.documentElement.classList.remove('light', 'dark');
                  document.documentElement.classList.add(mode);
                  document.documentElement.style.colorScheme = mode;
                } catch (e) {}
                try {
                  var rawTheme = localStorage.getItem('ui-theme');
                  var theme = rawTheme === 'default' ? 'pink' : rawTheme === 'chelsea-blue' ? 'chelsea' : rawTheme;
                  if (theme) {
                    document.documentElement.classList.add('theme-' + theme);
                    document.documentElement.setAttribute('data-color-theme', theme);
                  } else {
                    document.documentElement.removeAttribute('data-color-theme');
                  }
                } catch (e) {}
              })();
					`}
				</Script>
			</head>
			<body className="antialiased bg-background text-foreground">
				{children}
				<Suspense fallback={null}>
					<Analytics />
					<SpeedInsights />
				</Suspense>
			</body>
		</html>
	);
}
