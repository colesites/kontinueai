import React from "react";
import { Pressable, View } from "react-native";
import { Link } from "expo-router";
import { useSignUp } from "@clerk/expo";
import * as Sentry from "@sentry/react-native";
import { LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react-native";

import { Text } from "@/components/ui/text";
import {
  AuthError,
  AuthField,
  AuthNotice,
} from "@/components/auth/auth-field";
import { GoogleButton } from "@/components/auth/google-button";
import { AuthScaffold } from "@/components/auth/auth-scaffold";
import { AuthButton, AuthDivider } from "@/components/auth/auth-button";
import { useGoogleOAuth } from "@/components/auth/use-google-oauth";

const RESEND_COOLDOWN_SECONDS = 30;

function errorMessage(error: unknown, fallback: string) {
  if (typeof error !== "object" || error === null) return fallback;

  const candidate = error as { longMessage?: unknown; message?: unknown };
  if (typeof candidate.longMessage === "string") return candidate.longMessage;
  if (typeof candidate.message === "string") return candidate.message;
  return fallback;
}

function reportDeliveryError(error: unknown, operation: "initial" | "resend") {
  const message = errorMessage(
    error,
    "Clerk could not send the email verification code.",
  );
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "unknown";

  Sentry.withScope((scope) => {
    scope.setTag("subsystem", "email-verification");
    scope.setTag("operation", operation);
    scope.setExtra("clerkErrorCode", code);
    Sentry.captureException(
      error instanceof Error ? error : new Error(`${code}: ${message}`),
    );
  });
}

export default function SignUpScreen() {
  // Signal-based Clerk API (@clerk/expo 3.x). `signUp.password()` creates the
  // account, `signUp.verifications.*` drives email-code verification, and
  // `signUp.finalize()` activates the session once `status === 'complete'`.
  const { signUp, fetchStatus } = useSignUp();
  const {
    signInWithGoogle,
    isLoading: isGoogleLoading,
    error: googleError,
  } = useGoogleOAuth();

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [pendingVerification, setPendingVerification] = React.useState(false);
  const [deliveryConfirmed, setDeliveryConfirmed] = React.useState(false);
  const [resendCooldown, setResendCooldown] = React.useState(0);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const isSubmitting = fetchStatus === "fetching";

  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(
      () => setResendCooldown((seconds) => Math.max(0, seconds - 1)),
      1_000,
    );
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const sendVerificationCode = async (operation: "initial" | "resend") => {
    setError(null);
    setNotice(null);

    try {
      const { error: sendError } =
        await signUp.verifications.sendEmailCode();
      if (sendError) {
        reportDeliveryError(sendError, operation);
        setDeliveryConfirmed(false);
        setError(
          errorMessage(
            sendError,
            "We couldn't send the verification email. Please try again.",
          ),
        );
        return false;
      }

      setDeliveryConfirmed(true);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      if (operation === "resend") {
        setNotice("A fresh code was sent. It may take a minute to arrive.");
      }
      return true;
    } catch (sendError) {
      reportDeliveryError(sendError, operation);
      setDeliveryConfirmed(false);
      setError(
        errorMessage(
          sendError,
          "We couldn't reach the email service. Check your connection and retry.",
        ),
      );
      return false;
    }
  };

  const handleSignUp = async () => {
    if (isSubmitting) return;
    setError(null);

    // Split the entered name so Clerk populates `fullName` (what the app
    // displays). Google sign-in fills these from the Google profile; for
    // email sign-up we collect them here.
    const [firstName, ...rest] = name.trim().split(/\s+/);
    const lastName = rest.join(" ");

    const { error: createError } = await signUp.password({
      emailAddress: email.trim(),
      password,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
    });
    if (createError) {
      setError(createError.longMessage ?? createError.message);
      return;
    }

    setPendingVerification(true);
    setDeliveryConfirmed(false);
    await sendVerificationCode("initial");
  };

  const handleResend = async () => {
    if (isSubmitting || resendCooldown > 0) return;
    await sendVerificationCode("resend");
  };

  const handleEditEmail = () => {
    if (isSubmitting) return;
    setPendingVerification(false);
    setDeliveryConfirmed(false);
    setResendCooldown(0);
    setCode("");
    setNotice(null);
    setError(null);
  };

  const handleVerify = async () => {
    if (isSubmitting) return;
    setError(null);

    const { error: verifyError } = await signUp.verifications.verifyEmailCode({
      code,
    });
    if (verifyError) {
      setError(verifyError.longMessage ?? verifyError.message);
      return;
    }

    if (signUp.status === "complete") {
      const { error: finalizeError } = await signUp.finalize();
      if (finalizeError) {
        setError(finalizeError.longMessage ?? finalizeError.message);
      }
    } else {
      setError("That code didn't work. Please try again.");
    }
  };

  if (pendingVerification) {
    return (
      <AuthScaffold
        title="Check your inbox"
        subtitle={
          deliveryConfirmed
            ? `We sent a verification code to ${email.trim()}`
            : `Send a verification code to ${email.trim()}`
        }
      >
        <AuthField
          label="Verification code"
          leadingIcon={ShieldCheck}
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          editable={!isSubmitting}
        />

        {notice ? <AuthNotice message={notice} /> : null}
        {error ? <AuthError message={error} /> : null}

        <AuthButton
          label={isSubmitting ? "Verifying…" : "Verify"}
          onPress={handleVerify}
          disabled={!code || isSubmitting}
          loading={isSubmitting}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Resend verification code"
          accessibilityState={{
            disabled: isSubmitting || resendCooldown > 0,
            busy: isSubmitting,
          }}
          onPress={handleResend}
          disabled={isSubmitting || resendCooldown > 0}
          className="h-11 items-center justify-center self-stretch rounded-xl border border-border bg-foreground/[0.03] px-4 active:bg-foreground/[0.07]"
        >
          <Text
            className={
              resendCooldown > 0
                ? "text-[13px] font-medium text-muted-foreground"
                : "text-[13px] font-semibold text-primary"
            }
          >
            {resendCooldown > 0
              ? `Resend available in ${resendCooldown}s`
              : deliveryConfirmed
                ? "Resend verification code"
                : "Try sending the code again"}
          </Text>
        </Pressable>

        <View className="items-center gap-1">
          <Text variant="muted" className="text-center text-xs leading-5">
            Still nothing? Check Spam and Promotions, then confirm the address.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit email address"
            onPress={handleEditEmail}
            disabled={isSubmitting}
            hitSlop={8}
          >
            <Text className="text-[13px] font-semibold text-primary">
              Edit email address
            </Text>
          </Pressable>
        </View>
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold
      title="Create your account"
      subtitle="Start building with Kontinue"
      footer={
        <Link href="/(auth)/sign-in" asChild>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Already have an account? Sign in"
            className="min-h-11 items-center justify-center px-4"
          >
            <Text className="text-center text-sm leading-5 text-muted-foreground">
              Already have an account?{" "}
              <Text className="text-sm font-semibold leading-5 text-primary">
                Sign in
              </Text>
            </Text>
          </Pressable>
        </Link>
      }
    >
      <AuthField
        label="Name (optional)"
        leadingIcon={UserRound}
        value={name}
        onChangeText={setName}
        placeholder="Your full name"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        editable={!isSubmitting && !isGoogleLoading}
      />

      <AuthField
        label="Email address"
        leadingIcon={Mail}
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        editable={!isSubmitting && !isGoogleLoading}
      />

      <AuthField
        label="Password"
        leadingIcon={LockKeyhole}
        password
        value={password}
        onChangeText={setPassword}
        placeholder="Create a password"
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        editable={!isSubmitting && !isGoogleLoading}
      />

      {error || googleError ? (
        <AuthError message={error ?? googleError ?? "Sign-up failed."} />
      ) : null}

      <AuthButton
        label={isSubmitting ? "Creating account…" : "Sign up"}
        onPress={handleSignUp}
        disabled={!email || !password || isSubmitting || isGoogleLoading}
        loading={isSubmitting}
      />

      <AuthDivider />

      <GoogleButton
        label="Continue with Google"
        onPress={signInWithGoogle}
        disabled={isSubmitting || isGoogleLoading}
        loading={isGoogleLoading}
      />

      {/* Web-only Clerk bot protection mount point; harmless on native. */}
      <View nativeID="clerk-captcha" />
    </AuthScaffold>
  );
}
