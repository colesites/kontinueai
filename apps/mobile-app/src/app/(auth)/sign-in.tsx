import { Pressable, View } from "react-native";
import { Link, type Href } from "expo-router";
import { LockKeyhole, Mail } from "lucide-react-native";

import { Text } from "@/components/ui/text";
import { AuthError, AuthField } from "@/components/auth/auth-field";
import { GoogleButton } from "@/components/auth/google-button";
import { AuthScaffold } from "@/components/auth/auth-scaffold";
import { AuthButton, AuthDivider } from "@/components/auth/auth-button";
import { useGoogleOAuth } from "@/components/auth/use-google-oauth";
import { SignInVerificationScreen } from "@/components/auth/sign-in-verification-screen";
import { usePasswordSignIn } from "@/components/auth/use-password-sign-in";

export default function SignInScreen() {
  const {
    signInWithGoogle,
    isLoading: isGoogleLoading,
    error: googleError,
  } = useGoogleOAuth();
  const {
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
  } = usePasswordSignIn();

  const disabled = !email || !password || isSubmitting || isGoogleLoading;

  if (verificationStep) {
    return (
      <SignInVerificationScreen
        step={verificationStep}
        code={code}
        onCodeChange={setCode}
        isSubmitting={isSubmitting}
        resendCooldown={resendCooldown}
        notice={notice}
        error={error}
        onVerify={verifyCode}
        onResend={resendCode}
        onStartOver={startOver}
      />
    );
  }

  return (
    <AuthScaffold
      title="Welcome back"
      subtitle="Sign in to continue to Kontinue"
      footer={
        <Link href="/(auth)/sign-up" asChild>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Don't have an account? Sign up"
            className="min-h-11 items-center justify-center px-4"
          >
            <Text className="text-center text-sm leading-5 text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Text className="text-sm font-semibold leading-5 text-primary">
                Sign up
              </Text>
            </Text>
          </Pressable>
        </Link>
      }
    >
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

      <View className="gap-2.5">
        <AuthField
          label="Password"
          leadingIcon={LockKeyhole}
          password
          value={password}
          onChangeText={setPassword}
          placeholder="Enter your password"
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          editable={!isSubmitting && !isGoogleLoading}
          onSubmitEditing={submitPassword}
          returnKeyType="go"
        />
        <Link href={"/(auth)/forgot-password" as Href} className="self-end">
          <Text variant="muted" className="text-xs">
            Forgot password?
          </Text>
        </Link>
      </View>

      {error || googleError ? (
        <AuthError message={error ?? googleError ?? "Sign-in failed."} />
      ) : null}

      <AuthButton
        label={isSubmitting ? "Signing in…" : "Continue"}
        onPress={submitPassword}
        disabled={disabled}
        loading={isSubmitting}
      />

      <AuthDivider />

      <GoogleButton
        label="Continue with Google"
        onPress={signInWithGoogle}
        disabled={isSubmitting || isGoogleLoading}
        loading={isGoogleLoading}
      />
    </AuthScaffold>
  );
}
