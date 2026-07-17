// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const isProduction = process.env.NODE_ENV === "production";

Sentry.init({
	dsn: "https://b5fb6ff3bea6ee06e60823b90e469665@o4510009236258816.ingest.de.sentry.io/4510936205819984",
	enabled: isProduction,

	// Error reporting stays enabled; request tracing is handled by Vercel and
	// must not add work to every server response.
	tracesSampleRate: 0,

	enableLogs: false,

	// Enable sending user PII (Personally Identifiable Information)
	// https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
	sendDefaultPii: false,
});
