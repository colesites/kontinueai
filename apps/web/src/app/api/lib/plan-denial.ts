export const PLAN_ERROR_CODES = {
	FILE_UPLOAD_REQUIRED: "PAID_FILE_UPLOAD_REQUIRED",
	PREMIUM_MODEL_REQUIRED: "PAID_MODEL_REQUIRED",
	KODE_PRO_REQUIRED: "KODE_PRO_REQUIRED",
} as const;

export type PlanErrorCode =
	(typeof PLAN_ERROR_CODES)[keyof typeof PLAN_ERROR_CODES];

export function planDeniedResponse(
	code: PlanErrorCode,
	message: string,
): Response {
	return new Response(message, {
		status: 403,
		headers: { "x-error-code": code },
	});
}
