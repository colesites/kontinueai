import { Pressable } from "react-native";
import { ShieldCheck } from "lucide-react-native";

import { AuthButton } from "@/components/auth/auth-button";
import { AuthError, AuthField, AuthNotice } from "@/components/auth/auth-field";
import { AuthScaffold } from "@/components/auth/auth-scaffold";
import {
  verificationCopy,
  type SignInVerificationStep,
} from "@/components/auth/sign-in-verification";
import { Text } from "@/components/ui/text";

type SignInVerificationScreenProps = {
  step: SignInVerificationStep;
  code: string;
  onCodeChange: (code: string) => void;
  isSubmitting: boolean;
  resendCooldown: number;
  notice: string | null;
  error: string | null;
  onVerify: () => void;
  onResend: () => void;
  onStartOver: () => void;
};

export function SignInVerificationScreen({
  step,
  code,
  onCodeChange,
  isSubmitting,
  resendCooldown,
  notice,
  error,
  onVerify,
  onResend,
  onStartOver,
}: SignInVerificationScreenProps) {
  const copy = verificationCopy(step);
  const canResend =
    step.strategy === "email_code" || step.strategy === "phone_code";

  return (
    <AuthScaffold title={copy.title} subtitle={copy.subtitle}>
      <AuthField
        label={copy.codeLabel}
        leadingIcon={ShieldCheck}
        value={code}
        onChangeText={onCodeChange}
        placeholder={copy.placeholder}
        autoCapitalize="none"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        keyboardType={
          step.strategy === "backup_code" ? "default" : "number-pad"
        }
        editable={!isSubmitting}
        onSubmitEditing={onVerify}
        returnKeyType="go"
      />

      {step.reason === "client_trust" ? (
        <AuthNotice message="Your email is already verified. Clerk is confirming this Android installation because it is a new device or app install." />
      ) : null}
      {notice ? <AuthNotice message={notice} /> : null}
      {error ? <AuthError message={error} /> : null}

      <AuthButton
        label={isSubmitting ? "Verifying…" : "Verify and sign in"}
        onPress={onVerify}
        disabled={!code.trim() || isSubmitting}
        loading={isSubmitting}
      />

      {canResend ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Resend security code"
          accessibilityState={{
            disabled: isSubmitting || resendCooldown > 0,
            busy: isSubmitting,
          }}
          onPress={onResend}
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
              : "Send a new code"}
          </Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start sign-in over"
        onPress={onStartOver}
        disabled={isSubmitting}
        className="min-h-11 items-center justify-center px-4"
      >
        <Text className="text-[13px] font-semibold text-muted-foreground">
          Start over
        </Text>
      </Pressable>

      {step.strategy === "email_code" ? (
        <Text variant="muted" className="text-center text-xs leading-5">
          Didn&apos;t receive it? Check Spam and Promotions before resending.
        </Text>
      ) : null}
    </AuthScaffold>
  );
}
