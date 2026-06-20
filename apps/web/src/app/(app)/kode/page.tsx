import type { Metadata } from "next";
import { headers } from "next/headers";
import { KodeComingSoon } from "../../../features/kode/components/KodeComingSoon";
import { KodeDashboard } from "../../../features/kode/components/KodeDashboard";
import { isKodeComingSoon } from "../../../features/kode/lib/availability";

export const metadata: Metadata = {
	title: "Kode — Kontinue AI",
	description: "Build working web apps from a prompt with Kode.",
};

export default async function KodePage() {
	if (isKodeComingSoon((await headers()).get("host"))) {
		return <KodeComingSoon />;
	}
	return <KodeDashboard />;
}
