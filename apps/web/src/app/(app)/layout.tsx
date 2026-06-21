import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import LoadingFallback from "../../components/LoadingFallback";
import { isKodeComingSoon } from "../../features/kode/lib/availability";
import { protectedAppRedirect } from "../../lib/auth-routing";
import { AppShell } from "./AppShell";

export const metadata: Metadata = {
	title: "Kontinue AI - Chat",
};

export default async function AppLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	// Check auth at page level - more secure than proxy
	const { userId } = await auth();

	const authRedirect = protectedAppRedirect(userId);
	if (authRedirect) redirect(authRedirect);

	const headerList = await headers();
	const host = headerList.get("host") || "";

	const cookieStore = await cookies();
	const defaultOpen = cookieStore.get("sidebar_state")?.value === "true";
	const kodeComingSoon = isKodeComingSoon(host);

	return (
		<Suspense fallback={<LoadingFallback />}>
			<AppShell defaultOpen={defaultOpen} kodeComingSoon={kodeComingSoon}>
				{children}
			</AppShell>
		</Suspense>
	);
}
