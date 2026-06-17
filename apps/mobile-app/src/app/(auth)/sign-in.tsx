import React from "react";
import { View } from "react-native";
import { Link, type Href } from "expo-router";
import { useSignIn } from "@clerk/expo";

import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { GoogleButton } from "@/components/auth/google-button";
import { AuthScaffold } from "@/components/auth/auth-scaffold";
import { AuthButton, AuthDivider } from "@/components/auth/auth-button";
import { useGoogleOAuth } from "@/components/auth/use-google-oauth";

export default function SignInScreen() {
  // Signal-based Clerk API (@clerk/expo 3.x): `signIn` is a future resource
  // whose `.status` drives the flow; methods return `{ error }` instead of
  // throwing, and `signIn.finalize()` activates the session.
  const { signIn, fetchStatus } = useSignIn();
  const {
    signInWithGoogle,
    isLoading: isGoogleLoading,
    error: googleError,
  } = useGoogleOAuth();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const isSubmitting = fetchStatus === "fetching";

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setError(null);

    const { error: passwordError } = await signIn.password({
      identifier: email.trim(),
      password,
    });
    if (passwordError) {
      setError(passwordError.longMessage ?? passwordError.message);
      return;
    }

    if (signIn.status === "complete") {
      // Activating the session flips `isSignedIn`; the root layout's
      // Stack.Protected guard swaps the auth stack for the app.
      const { error: finalizeError } = await signIn.finalize();
      if (finalizeError) {
        setError(finalizeError.longMessage ?? finalizeError.message);
      }
    } else {
      setError("Additional verification is required to sign in.");
    }
  };

  const disabled = !email || !password || isSubmitting || isGoogleLoading;

  return (
    <AuthScaffold
      title="Welcome back"
      subtitle="Sign in to continue to Kontinue"
      footer={
        <View className="flex-row gap-1">
          <Text variant="muted">Don&apos;t have an account?</Text>
          <Link href="/(auth)/sign-up">
            <Text className="text-primary font-semibold">Sign up</Text>
          </Link>
        </View>
      }
    >
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
        <Input
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          autoCapitalize="none"
          editable={!isSubmitting}
          onSubmitEditing={handleSubmit}
          returnKeyType="go"
        />
        <Link href={"/(auth)/forgot-password" as Href} className="self-end">
          <Text variant="muted" className="text-xs">
            Forgot password?
          </Text>
        </Link>
      </View>

      {(error || googleError) && (
        <Text className="text-destructive text-sm">{error ?? googleError}</Text>
      )}

      <AuthButton
        label={isSubmitting ? "Signing in…" : "Continue"}
        onPress={handleSubmit}
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
