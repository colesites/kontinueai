import type { Metadata } from "next";
import { Suspense } from "react";
import Spinner from "../../../../components/Spinner";
import { KodeRemoteDeviceRoute } from "../../../../features/kode-remote/components/routes";

export const metadata: Metadata = {
	title: "Kode remote control - Kontinue AI",
};

// Required for Cache Components - provide at least one param for validation
export async function generateStaticParams() {
	return [{ deviceId: "placeholder" }];
}

export default function KodeRemoteDevicePage() {
	return (
		<Suspense fallback={<Spinner />}>
			<KodeRemoteDeviceRoute />
		</Suspense>
	);
}
