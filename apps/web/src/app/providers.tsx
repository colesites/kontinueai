"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { Toaster } from "sonner";
import { useClerkTheme } from "../components/ClerkThemeProvider";
import { ThemeProvider } from "../components/theme-provider";

function ClerkWrapper({ children }: { children: React.ReactNode }) {
	const clerkTheme = useClerkTheme();

	return (
		<ClerkProvider
			appearance={{
				baseTheme: dark,
				variables: clerkTheme.variables,
				elements: clerkTheme.elements,
			}}
		>
			{children}
		</ClerkProvider>
	);
}

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<ThemeProviders>
			<ClerkWrapper>{children}</ClerkWrapper>
		</ThemeProviders>
	);
}

export function ThemeProviders({ children }: { children: React.ReactNode }) {
	return (
		<ThemeProvider
			attribute="class"
			defaultTheme="system"
			enableSystem
			disableTransitionOnChange
		>
			{children}
			<Toaster richColors theme="system" />
		</ThemeProvider>
	);
}
