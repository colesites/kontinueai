import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import { ThemeProvider } from "../components/theme-provider";
import "./globals.css";
import LoadingFallback from "../components/LoadingFallback";

export const metadata: Metadata = {
  title: "Kontinue AI",
  description: "Continue your AI conversations from any platform",
  icons: {
    icon: "/favicon.ico",
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
