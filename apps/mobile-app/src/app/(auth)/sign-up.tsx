import React from "react";
import { Pressable, View } from "react-native";
import { Link } from "expo-router";
import { useSignUp } from "@clerk/expo";

import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { GoogleButton } from "@/components/auth/google-button";
import { AuthScaffold } from "@/components/auth/auth-scaffold";
import { AuthButton, AuthDivider } from "@/components/auth/auth-button";
import { useGoogleOAuth } from "@/components/auth/use-google-oauth";

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
  const [error, setError] = React.useState<string | null>(null);

  const isSubmitting = fetchStatus === "fetching";

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

    const { error: sendError } = await signUp.verifications.sendEmailCode();
    if (sendError) {
      setError(sendError.longMessage ?? sendError.message);
      return;
    }
    setPendingVerification(true);
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
        subtitle={`We sent a verification code to ${email.trim()}`}
      >
        <View className="gap-1.5">
          <Text variant="small">Verification code</Text>
          <Input
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            editable={!isSubmitting}
          />
        </View>

        {error && <Text className="text-destructive text-sm">{error}</Text>}

        <AuthButton
          label={isSubmitting ? "Verifying…" : "Verify"}
          onPress={handleVerify}
          disabled={!code || isSubmitting}
          loading={isSubmitting}
        />

        <Pressable
          onPress={() => signUp.verifications.sendEmailCode()}
          disabled={isSubmitting}
          className="self-center"
          hitSlop={8}
        >
          <Text variant="muted" className="text-sm">
            I need a new code
          </Text>
        </Pressable>
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold
      title="Create your account"
      subtitle="Start building with Kontinue"
      footer={
        <View className="flex-row gap-1">
          <Text variant="muted">Already have an account?</Text>
          <Link href="/(auth)/sign-in">
            <Text className="text-primary font-semibold">Sign in</Text>
          </Link>
        </View>
      }
    >
      <View className="gap-1.5">
        <Text variant="small">Name (optional)</Text>
        <Input
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          autoCapitalize="words"
          autoComplete="name"
          editable={!isSubmitting}
        />
      </View>

      <View className="gap-1.5">
        <Text variant="small">Email</Text>
        <Input
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          editable={!isSubmitting}
        />
      </View>

      <View className="gap-1.5">
        <Text variant="small">Password</Text>
        <Input
          value={password}
          onChangeText={setPassword}
          placeholder="Create a password"
          secureTextEntry
          autoCapitalize="none"
          editable={!isSubmitting}
        />
      </View>

      {(error || googleError) && (
        <Text className="text-destructive text-sm">{error ?? googleError}</Text>
      )}

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
