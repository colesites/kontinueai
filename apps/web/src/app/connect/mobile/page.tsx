import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileConnectHandoff } from "./MobileConnectHandoff";

export const metadata: Metadata = {
	title: "Connecting… | Kontinue AI",
	robots: { index: false, follow: false },
};

export default function MobileConnectPage() {
	return (
		<Suspense fallback={null}>
			<MobileConnectHandoff />
		</Suspense>
	);
}
