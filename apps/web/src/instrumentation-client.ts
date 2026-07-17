// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const isProduction = process.env.NODE_ENV === "production";

Sentry.init({
	dsn: "https://b5fb6ff3bea6ee06e60823b90e469665@o4510009236258816.ingest.de.sentry.io/4510936205819984",
	enabled: isProduction,

	// Vercel Speed Insights is the performance source of truth. Keep Sentry for
	// error reporting without shipping tracing and Replay to every browser.
	tracesSampleRate: 0,
	enableLogs: false,

	// Enable sending user PII (Personally Identifiable Information)
	// https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
	sendDefaultPii: false,
});
