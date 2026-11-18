import { router, type Href } from "expo-router";
import type { AppErrorPayload } from "@repo/core/app-errors";
import { toClientAppError } from "@repo/core/app-error-client";
import { planLabel } from "@repo/core/plan-tier";

import { toast } from "@/components/ui/toast";

export {
  AppError,
  readApiError,
  toClientAppError,
} from "@repo/core/app-error-client";

function isPayload(value: unknown): value is AppErrorPayload {
  return (
    !!value &&
    typeof value === "object" &&
    "code" in value &&
    "title" in value &&
    "message" in value
  );
}

/**
 * Native counterpart of web's `showAppErrorToast`: one catch turns any failure
 * (AppError, ConvexError, failed fetch) into a toast, with an "Upgrade to …"
 * action whenever upgrading is what fixes it.
 */
export function showAppErrorToast(error: unknown) {
  const payload = isPayload(error) ? error : toClientAppError(error);
  toast.error(payload.title, {
    description: payload.message,
    ...(payload.upgradeTo
      ? {
          duration: 7000,
          action: {
            label: `Upgrade to ${planLabel(payload.upgradeTo)}`,
            onPress: () => router.push("/pricing" as Href),
          },
        }
      : {}),
  });
}

/** Message from a ConvexError / Error, for inline copy that isn't a toast. */
export function errorMessage(error: unknown, fallback: string): string {
  const data = (error as { data?: unknown } | null)?.data;
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  if (typeof data === "string" && data) return data;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
