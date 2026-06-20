import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import Spinner from "../../../../components/Spinner";
import { KodeComingSoon } from "../../../../features/kode/components/KodeComingSoon";
import { KodeWorkspace } from "../../../../features/kode/components/KodeWorkspace";
import { isKodeComingSoon } from "../../../../features/kode/lib/availability";

export const metadata: Metadata = {
	title: "Kode Workspace — Kontinue AI",
};

export async function generateStaticParams() {
	return [{ projectId: "placeholder" }];
}

export default async function KodeProjectPage() {
	if (isKodeComingSoon((await headers()).get("host"))) {
		return <KodeComingSoon />;
	}
	return (
		<Suspense fallback={<Spinner />}>
			<KodeWorkspace />
		</Suspense>
	);
}
