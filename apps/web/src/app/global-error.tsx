"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		Sentry.captureException(error);
	}, [error]);

	// This boundary replaces the root layout, so it renders without the app's
	// theme/CSS context. Styles are inlined so it always renders correctly.
	return (
		<html lang="en">
			<body
				style={{
					margin: 0,
					minHeight: "100vh",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					padding: "24px",
					background:
						"radial-gradient(120% 120% at 50% 0%, #17141a 0%, #0b0b0e 60%)",
					color: "#fafafa",
					fontFamily:
						"ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
				}}
			>
				<div style={{ maxWidth: "420px", textAlign: "center" }}>
					<div
						style={{
							width: "56px",
							height: "56px",
							margin: "0 auto 20px",
							borderRadius: "16px",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							fontSize: "26px",
							fontWeight: 700,
							color: "#ef3a93",
							background: "rgba(233,30,99,0.12)",
							boxShadow:
								"inset 0 0 0 1px rgba(233,30,99,0.3), 0 0 28px -6px rgba(233,30,99,0.5)",
						}}
					>
						!
					</div>
					<h1
						style={{
							fontSize: "22px",
							fontWeight: 600,
							letterSpacing: "-0.01em",
							margin: "0 0 8px",
						}}
					>
						Something went wrong
					</h1>
					<p
						style={{
							fontSize: "14px",
							lineHeight: 1.6,
							color: "rgba(250,250,250,0.6)",
							margin: "0 0 24px",
						}}
					>
						An unexpected error occurred. Try again, and if it keeps happening
						reach us at support@kontinueai.com.
					</p>
					<button
						type="button"
						onClick={() => reset()}
						style={{
							cursor: "pointer",
							border: "none",
							borderRadius: "999px",
							padding: "10px 22px",
							fontSize: "14px",
							fontWeight: 600,
							color: "#fff",
							background: "linear-gradient(to bottom, #f04ba0, #e91e63)",
							boxShadow:
								"inset 0 1px 0 rgba(255,255,255,0.25), 0 6px 22px -4px rgba(233,30,99,0.6)",
						}}
					>
						Try again
					</button>
				</div>
			</body>
		</html>
	);
}
