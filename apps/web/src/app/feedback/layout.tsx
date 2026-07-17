import type { ReactNode } from "react";
import { Suspense } from "react";
import { PageRouteFallback } from "../../components/RouteLoadingFallbacks";
import { ConvexProviders } from "../data-providers";
import { Providers } from "../providers";

export default function FeedbackLayout({ children }: { children: ReactNode }) {
	return (
		<Suspense fallback={<PageRouteFallback label="Loading feedback" />}>
			<Providers>
				<ConvexProviders>{children}</ConvexProviders>
			</Providers>
		</Suspense>
	);
}
