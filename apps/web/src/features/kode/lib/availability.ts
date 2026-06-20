import "server-only";

const KODE_PRODUCTION_HOST = "chat.kontinueai.com";

export function isKodeComingSoon(host: string | null): boolean {
	const hostname = host?.split(",")[0]?.trim().split(":")[0]?.toLowerCase();
	const isProduction =
		hostname === KODE_PRODUCTION_HOST ||
		process.env.VERCEL_ENV === "production";
	return isProduction && process.env.KODE_WEB_PRODUCTION_ENABLED !== "true";
}
