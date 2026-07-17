import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppRouteFallback } from "../../components/RouteLoadingFallbacks";
import { isKodeComingSoon } from "../../features/kode/lib/availability";
import { protectedAppRedirect } from "../../lib/auth-routing";
import { AppProviders } from "../data-providers";
import { Providers } from "../providers";
import { AppShell } from "./AppShell";

export const metadata: Metadata = {
	title: "Kontinue AI - Chat",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
	return (
		<Suspense fallback={<AppRouteFallback />}>
			<AuthenticatedAppLayout>{children}</AuthenticatedAppLayout>
		</Suspense>
	);
}

async function AuthenticatedAppLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	// These request APIs are independent. Starting them together removes a
	// request-time waterfall on every authenticated page.
	const [authState, cookieStore] = await Promise.all([auth(), cookies()]);

	const authRedirect = protectedAppRedirect(authState.userId);
	if (authRedirect) redirect(authRedirect);

	const defaultOpen = cookieStore.get("sidebar_state")?.value === "true";
	const kodeComingSoon = isKodeComingSoon(null);

	return (
		<Providers>
			<AppProviders>
				<AppShell defaultOpen={defaultOpen} kodeComingSoon={kodeComingSoon}>
					{children}
				</AppShell>
			</AppProviders>
		</Providers>
	);
}
