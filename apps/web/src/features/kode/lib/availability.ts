import "server-only";

import { resolveKodeComingSoon } from "./availability-policy";

export function isKodeComingSoon(host: string | null): boolean {
	return resolveKodeComingSoon({
		host,
		vercelEnv: process.env.VERCEL_ENV,
		productionEnabled: process.env.KODE_WEB_PRODUCTION_ENABLED,
	});
}
