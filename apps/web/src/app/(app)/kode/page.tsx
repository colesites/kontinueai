import type { Metadata } from "next";
import { KodeRemoteHome } from "../../../features/kode-remote/components/KodeRemoteHome";

export const metadata: Metadata = {
	title: "Kode remote control - Kontinue AI",
	description: "Run Kode on your computer from anywhere.",
};

export default function KodeRemotePage() {
	return <KodeRemoteHome />;
}
