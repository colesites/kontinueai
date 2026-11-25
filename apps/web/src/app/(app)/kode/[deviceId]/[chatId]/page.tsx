import type { Metadata } from "next";
import { Suspense } from "react";
import Spinner from "../../../../../components/Spinner";
import { KodeRemoteChatRoute } from "../../../../../features/kode-remote/components/routes";

export const metadata: Metadata = {
	title: "Kode remote control - Kontinue AI",
};

// Required for Cache Components - provide at least one param for validation
export async function generateStaticParams() {
	return [{ deviceId: "placeholder", chatId: "placeholder" }];
}

export default function KodeRemoteChatPage() {
	return (
		<Suspense fallback={<Spinner />}>
			<KodeRemoteChatRoute />
		</Suspense>
	);
}
