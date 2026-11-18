"use client";

import { toClientAppError } from "@repo/core/app-error-client";
import type { AppErrorPayload } from "@repo/core/app-errors";
import { planLabel } from "@repo/core/plan-tier";
import { toast } from "sonner";

// Parsing lives in @repo/core so the Expo app reads errors the same way.
export {
	AppError,
	readApiError,
	toClientAppError,
} from "@repo/core/app-error-client";

export function showAppErrorToast(
	error: unknown,
	options: { upgradeHref?: string } = {},
) {
	const payload =
		error && typeof error === "object" && "code" in error && "title" in error
			? (error as AppErrorPayload)
			: toClientAppError(error);
	const href = options.upgradeHref ?? "/pricing";
	toast.error(payload.title, {
		description: payload.message,
		...(payload.upgradeTo
			? {
					action: {
						label: `Upgrade to ${planLabel(payload.upgradeTo)}`,
						onClick: () => {
							window.location.href = href;
						},
					},
				}
			: {}),
	});
}
