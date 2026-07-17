export type GoogleAuthError = {
  code: string;
  message: string;
  userMessage: string;
  cancelled: boolean;
};

/** Converts Clerk, Credential Manager, and Expo browser errors into a stable
 * diagnostic code plus a useful message that is safe to show in the UI. */
export function getGoogleAuthError(error: unknown): GoogleAuthError {
  const record =
    error && typeof error === "object"
      ? (error as {
          code?: unknown;
          message?: unknown;
          longMessage?: unknown;
          errors?: {
            code?: unknown;
            message?: unknown;
            longMessage?: unknown;
          }[];
        })
      : null;
  const first = record?.errors?.[0];
  const code = String(first?.code ?? record?.code ?? "GOOGLE_AUTH_FAILED");
  const message = String(
    first?.longMessage ??
      first?.message ??
      record?.longMessage ??
      record?.message ??
      "Google authentication failed",
  );
  const normalized = `${code} ${message}`.toLowerCase();

  if (normalized.includes("cancel")) {
    return {
      code,
      message,
      userMessage: "Google sign-in was cancelled.",
      cancelled: true,
    };
  }
  if (
    normalized.includes("activity_unavailable") ||
    normalized.includes("missingactivity")
  ) {
    return {
      code,
      message,
      userMessage:
        "Google sign-in was not ready. Close and reopen the app, then try again.",
      cancelled: false,
    };
  }
  if (
    normalized.includes("developer_error") ||
    normalized.includes("configuration") ||
    normalized.includes("client id") ||
    normalized.includes("code 10")
  ) {
    return {
      code,
      message,
      userMessage:
        "Google sign-in is not configured for this Android build. Please contact support and mention GOOGLE_CONFIG.",
      cancelled: false,
    };
  }
  if (first?.longMessage || first?.message) {
    return { code, message, userMessage: message, cancelled: false };
  }
  return {
    code,
    message,
    userMessage: `Google sign-in failed. Please try again. (${code})`,
    cancelled: false,
  };
}
