import { clerkMiddleware } from "@clerk/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKENDS = [
	"https://api-1.us-east-1.aws.com",
	"https://api-2.eu-west-2.aws.com",
	"https://api-3.af-south-1.aws.com",
	"https://api-4.us-west-2.aws.com",
];

// 1. We define the clerk middleware handler
const clerk = clerkMiddleware();

export async function proxy(request: NextRequest, event: NextFetchEvent) {
	const { pathname, search } = request.nextUrl;

	// 2. Handle the AWS Failover Logic first
	if (pathname.startsWith("/api-proxy")) {
		for (const origin of BACKENDS) {
			try {
				const targetUrl = new URL(`${pathname}${search}`, origin);

				const response = await fetch(targetUrl.toString(), {
					method: request.method,
					headers: request.headers,
					signal: AbortSignal.timeout(1500),
				});

				if (response.ok) {
					return NextResponse.rewrite(targetUrl);
				}
			} catch (_err) {
				console.warn(`Backend ${origin} failed. Trying next...`);
			}
		}
		return NextResponse.json({ error: "Backend Unreachable" }, { status: 503 });
	}

	// 3. For all other routes, run Clerk authentication.
	// IMPORTANT: forward the REAL NextFetchEvent. Passing a fake `{}` here breaks
	// Clerk's auth-context propagation, so `auth()` in route handlers (e.g.
	// /api/chat) returns no userId and the request 401s ("You're not signed in").
	return clerk(
		request as unknown as Parameters<typeof clerk>[0],
		event as unknown as Parameters<typeof clerk>[1],
	);
}

export const config = {
	matcher: [
		// Public auth screens do not call server-side auth(). Keep them on the
		// static/CDN path instead of invoking Clerk middleware before every load.
		"/((?!_next|sign-in(?:/|$)|sign-up(?:/|$)|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		"/(api|trpc)(.*)",
		"/__clerk/(.*)",
		"/api-proxy/:path*",
	],
};
