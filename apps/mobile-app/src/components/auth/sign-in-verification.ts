export type SignInVerificationStrategy =
  | "email_code"
  | "phone_code"
  | "totp"
  | "backup_code";

export type SupportedSecondFactor = {
  strategy: string;
  safeIdentifier?: string;
};

export type SignInVerificationStep = {
  reason: "client_trust" | "mfa";
  strategy: SignInVerificationStrategy;
  safeIdentifier?: string;
};

const STRATEGY_PRIORITY: SignInVerificationStrategy[] = [
  "email_code",
  "phone_code",
  "totp",
  "backup_code",
];

/**
 * Chooses a verification factor Clerk's Expo signal API can complete natively.
 * Email is preferred because it is the default Client Trust factor, followed by
 * phone and user-configured authenticator/backup-code MFA.
 */
export function getSignInVerificationStep(
  status: string,
  factors: SupportedSecondFactor[] | null | undefined,
): SignInVerificationStep | null {
  if (status !== "needs_client_trust" && status !== "needs_second_factor") {
    return null;
  }

  const factor = STRATEGY_PRIORITY.map((strategy) =>
    factors?.find((candidate) => candidate.strategy === strategy),
  ).find(Boolean);

  if (!factor) return null;

  return {
    reason: status === "needs_client_trust" ? "client_trust" : "mfa",
    strategy: factor.strategy as SignInVerificationStrategy,
    safeIdentifier: factor.safeIdentifier,
  };
}

export function verificationCopy(step: SignInVerificationStep) {
  if (step.strategy === "totp") {
    return {
      title: "Authenticator check",
      subtitle: "Enter the current code from your authenticator app.",
      codeLabel: "Authenticator code",
      placeholder: "123456",
    };
  }

  if (step.strategy === "backup_code") {
    return {
      title: "Use a backup code",
      subtitle: "Enter one of the backup codes saved with your account.",
      codeLabel: "Backup code",
      placeholder: "Enter backup code",
    };
  }

  const destination = step.safeIdentifier
    ? ` to ${step.safeIdentifier}`
    : step.strategy === "phone_code"
      ? " to your verified phone number"
      : " to your verified email address";

  return {
    title:
      step.reason === "client_trust" ? "Verify this device" : "Security check",
    subtitle: `We sent a one-time code${destination}.`,
    codeLabel: "Verification code",
    placeholder: "123456",
  };
}
