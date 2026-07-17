import type { ReactNode } from "react";
import { Suspense } from "react";
import { PageRouteFallback } from "../../../components/RouteLoadingFallbacks";
import { PublicConvexProviders } from "../../data-providers";
import { ThemeProviders } from "../../providers";

export default function SharedChatLayout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<Suspense
			fallback={<PageRouteFallback label="Loading shared conversation" />}
		>
			<ThemeProviders>
				<PublicConvexProviders>{children}</PublicConvexProviders>
			</ThemeProviders>
		</Suspense>
	);
}
