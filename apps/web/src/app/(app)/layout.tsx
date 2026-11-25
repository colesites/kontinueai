import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppRouteFallback } from "../../components/RouteLoadingFallbacks";
import {
	clerkPostAuthRedirect,
	DESKTOP_AUTH_RETURN_COOKIE,
	protectedAppRedirect,
} from "../../lib/auth-routing";
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

	// A browser login started by the desktop app can land on the web app.
	// Send that session back to the handoff instead of opening the chat shell.
	const desktopReturn = clerkPostAuthRedirect(
		cookieStore.get(DESKTOP_AUTH_RETURN_COOKIE)?.value,
		process.env.NEXT_PUBLIC_APP_URL ?? "https://chat.kontinueai.com",
	);
	if (desktopReturn) redirect(desktopReturn);

	const defaultOpen = cookieStore.get("sidebar_state")?.value === "true";

	return (
		<Providers>
			<AppProviders>
				<AppShell defaultOpen={defaultOpen}>
					{children}
				</AppShell>
			</AppProviders>
		</Providers>
	);
}
