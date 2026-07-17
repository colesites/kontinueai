import type { ReactNode } from "react";
import { Suspense } from "react";
import { AuthRouteFallback } from "../../components/RouteLoadingFallbacks";
import { Providers } from "../providers";

export default function AuthLayout({ children }: { children: ReactNode }) {
	return (
		<Suspense fallback={<AuthRouteFallback />}>
			<Providers>{children}</Providers>
		</Suspense>
	);
}
