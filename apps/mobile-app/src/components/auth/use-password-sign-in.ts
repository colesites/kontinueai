import { useEffect, useState } from "react";
import { useSignIn } from "@clerk/expo";

import {
  getSignInVerificationStep,
  type SignInVerificationStep,
} from "@/components/auth/sign-in-verification";

const RESEND_COOLDOWN_SECONDS = 30;

function clerkErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== "object") return fallback;
  const candidate = error as { longMessage?: unknown; message?: unknown };
  if (typeof candidate.longMessage === "string") return candidate.longMessage;
  if (typeof candidate.message === "string") return candidate.message;
  return fallback;
}

export function usePasswordSignIn() {
  const { signIn, fetchStatus } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [verificationStep, setVerificationStep] =
    useState<SignInVerificationStep | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isSubmitting = fetchStatus === "fetching";

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(
      () => setResendCooldown((seconds) => Math.max(0, seconds - 1)),
      1_000,
    );
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const finalizeSignIn = async () => {
    const { error: finalizeError } = await signIn.finalize();
    if (!finalizeError) return true;

    setError(
      clerkErrorMessage(
        finalizeError,
        "Your sign-in was verified, but the session could not be opened.",
      ),
    );
    return false;
  };

  const sendVerificationCode = async (
    step: SignInVerificationStep,
    operation: "initial" | "resend",
  ) => {
    setError(null);
    setNotice(null);

    const result =
      step.strategy === "email_code"
        ? await signIn.mfa.sendEmailCode()
        : step.strategy === "phone_code"
          ? await signIn.mfa.sendPhoneCode()
          : { error: null };

    if (result.error) {
      setError(
        clerkErrorMessage(
          result.error,
          "We couldn't send the security code. Please try again.",
        ),
      );
      return false;
    }

    if (step.strategy === "email_code" || step.strategy === "phone_code") {
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      if (operation === "resend") {
        setNotice("A fresh security code was sent.");
      }
    }
    return true;
  };

  const continueSignIn = async () => {
    if (signIn.status === "complete") {
      await finalizeSignIn();
      return;
    }

    if (
      signIn.status === "needs_client_trust" ||
      signIn.status === "needs_second_factor"
    ) {
      const nextStep = getSignInVerificationStep(
        signIn.status,
        signIn.supportedSecondFactors,
      );

      if (!nextStep) {
        const available = signIn.supportedSecondFactors
          ?.map((factor) => factor.strategy)
          .join(", ");
        setError(
          available
            ? `This account requires an unsupported verification method (${available}).`
            : "Clerk requires another security check, but no verification method is available for this account.",
        );
        return;
      }

      if (await sendVerificationCode(nextStep, "initial")) {
        setCode("");
        setVerificationStep(nextStep);
      }
      return;
    }

    if (signIn.status === "needs_new_password") {
      setError(
        "This account requires a new password. Use Forgot password to continue securely.",
      );
      return;
    }

    setError(
      `The sign-in could not continue (status: ${signIn.status ?? "unknown"}). Start over and try again.`,
    );
  };

  const submitPassword = async () => {
    if (isSubmitting) return;
    setError(null);
    setNotice(null);

    const { error: passwordError } = await signIn.password({
      emailAddress: email.trim(),
      password,
    });
    if (passwordError) {
      setError(passwordError.longMessage ?? passwordError.message);
      return;
    }

    await continueSignIn();
  };

  const verifyCode = async () => {
    if (!verificationStep || isSubmitting || !code.trim()) return;
    setError(null);
    setNotice(null);

    const params = { code: code.trim() };
    const result =
      verificationStep.strategy === "email_code"
        ? await signIn.mfa.verifyEmailCode(params)
        : verificationStep.strategy === "phone_code"
          ? await signIn.mfa.verifyPhoneCode(params)
          : verificationStep.strategy === "totp"
            ? await signIn.mfa.verifyTOTP(params)
            : await signIn.mfa.verifyBackupCode(params);

    if (result.error) {
      setError(
        clerkErrorMessage(
          result.error,
          "That security code could not be verified. Please try again.",
        ),
      );
      return;
    }

    await continueSignIn();
  };

  const resendCode = async () => {
    if (!verificationStep || isSubmitting || resendCooldown > 0) return;
    await sendVerificationCode(verificationStep, "resend");
  };

  const startOver = async () => {
    if (isSubmitting) return;
    await signIn.reset();
    setPassword("");
    setCode("");
    setVerificationStep(null);
    setResendCooldown(0);
    setNotice(null);
    setError(null);
  };

  return {
    email,
    setEmail,
    password,
    setPassword,
    code,
    setCode,
    verificationStep,
    resendCooldown,
    notice,
    error,
    isSubmitting,
    submitPassword,
    verifyCode,
    resendCode,
    startOver,
  };
}
