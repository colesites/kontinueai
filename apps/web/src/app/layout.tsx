import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import { ThemeProvider } from "../components/theme-provider";
import "./globals.css";
import LoadingFallback from "../components/LoadingFallback";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://kontinueai.com";
const siteTitle = "Kontinue AI";
const siteDescription = "Continue your AI conversations from any platform";
const ogImage = "/kontinueai-3d.png";

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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var rawTheme = localStorage.getItem('ui-theme');
                  var theme = rawTheme === 'chelsea-blue' ? 'chelsea' : rawTheme;
                  if (theme && theme !== 'default') {
                    document.documentElement.classList.add('theme-' + theme);
                    document.documentElement.setAttribute('data-color-theme', theme);
                  } else {
                    document.documentElement.removeAttribute('data-color-theme');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Suspense fallback={<LoadingFallback />}>
            <Providers>{children}</Providers>
          </Suspense>
          <Toaster richColors theme="system" />
        </ThemeProvider>
      </body>
    </html>
  );
}
