export const KODE_WEB_MONTHLY_CREDITS = 100;
export const KODE_WEB_TOKENS_PER_CREDIT = 25_000;
export const KODE_WEB_PLAN_CREDIT_RESERVATION = 1;
export const KODE_WEB_BUILD_CREDIT_RESERVATION = 4;
export const KODE_WEB_MODEL_ID = "zai/glm-5.2";
export const KODE_WEB_MAX_PROJECT_FILES = 8;
export const KODE_WEB_MAX_FILE_BYTES = 180_000;

export const KODE_WEB_FILE_PATHS = [
	"index.html",
	"styles.css",
	"script.js",
] as const;

export type KodeWebFilePath = (typeof KODE_WEB_FILE_PATHS)[number];
export type KodeWebMode = "build" | "plan";

export function getKodeWebCreditCharge(totalTokens: number): number {
	return Math.max(
		1,
		Math.ceil(Math.max(0, totalTokens) / KODE_WEB_TOKENS_PER_CREDIT),
	);
}

export function getKodeWebMonthKey(now = Date.now()): string {
	return new Date(now).toISOString().slice(0, 7);
}

export function getKodeWebNextResetAt(now = Date.now()): number {
	const date = new Date(now);
	return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}
