const KODE_PRODUCTION_HOST = "chat.kontinueai.com";

export function resolveKodeComingSoon(options: {
	host: string | null;
	vercelEnv?: string;
	productionEnabled?: string;
}): boolean {
	const hostname = options.host
		?.split(",")[0]
		?.trim()
		.split(":")[0]
		?.toLowerCase();
	const isProduction =
		hostname === KODE_PRODUCTION_HOST || options.vercelEnv === "production";
	return isProduction && options.productionEnabled !== "true";
}
