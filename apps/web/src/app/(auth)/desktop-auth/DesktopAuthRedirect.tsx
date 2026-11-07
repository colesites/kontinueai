"use client";

import { useEffect } from "react";

export function DesktopAuthRedirect({ href }: { href: string }) {
	useEffect(() => {
		window.location.replace(href);
	}, [href]);

	return (
		<div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
			<p>Taking you to sign in.</p>
			<a href={href} className="mt-3 inline-block text-foreground underline">
				Continue
			</a>
		</div>
	);
}
