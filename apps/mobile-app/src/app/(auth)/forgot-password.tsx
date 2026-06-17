import React from "react";
import { Pressable, View } from "react-native";
import { Link } from "expo-router";
import { useSignIn } from "@clerk/expo";

import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { AuthScaffold } from "@/components/auth/auth-scaffold";
import { AuthButton } from "@/components/auth/auth-button";

export default function ForgotPasswordScreen() {
  // Signal-based reset flow: create() seeds the identifier ->
  // resetPasswordEmailCode.sendCode() -> verifyCode({code}) ->
  // submitPassword({password}) -> finalize().
  const { signIn, fetchStatus } = useSignIn();

  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [codeSent, setCodeSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isSubmitting = fetchStatus === "fetching";

  const handleSendCode = async () => {
    if (isSubmitting) return;
    setError(null);

    const { error: createError } = await signIn.create({
      identifier: email.trim(),
    });
    if (createError) {
      setError(createError.longMessage ?? createError.message);
      return;
    }

    const { error: sendError } =
      await signIn.resetPasswordEmailCode.sendCode();
    if (sendError) {
      setError(sendError.longMessage ?? sendError.message);
      return;
    }
    setCodeSent(true);
  };

  const handleReset = async () => {
    if (isSubmitting) return;
    setError(null);

    const { error: verifyError } =
      await signIn.resetPasswordEmailCode.verifyCode({ code });
    if (verifyError) {
      setError(verifyError.longMessage ?? verifyError.message);
      return;
    }

    const { error: submitError } =
      await signIn.resetPasswordEmailCode.submitPassword({ password });
    if (submitError) {
      setError(submitError.longMessage ?? submitError.message);
      return;
    }

    if (signIn.status === "complete") {
      const { error: finalizeError } = await signIn.finalize();
      if (finalizeError) {
        setError(finalizeError.longMessage ?? finalizeError.message);
      }
      // On success the root layout guard navigates into the app.
    } else {
      setError("Could not reset your password. Please try again.");
    }
  };

  const footer = (
    <View className="flex-row gap-1">
      <Text variant="muted">Remember it?</Text>
      <Link href="/(auth)/sign-in">
        <Text className="text-primary font-semibold">Sign in</Text>
      </Link>
    </View>
  );

  if (codeSent) {
    return (
      <AuthScaffold
        title="Set a new password"
        subtitle={`Enter the code we sent to ${email.trim()}`}
        footer={footer}
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

        <View className="gap-1.5">
          <Text variant="small">New password</Text>
          <Input
            value={password}
            onChangeText={setPassword}
            placeholder="Enter a new password"
            secureTextEntry
            autoCapitalize="none"
            editable={!isSubmitting}
          />
        </View>

        {error && <Text className="text-destructive text-sm">{error}</Text>}

        <AuthButton
          label={isSubmitting ? "Resetting…" : "Reset password"}
          onPress={handleReset}
          disabled={!code || !password || isSubmitting}
          loading={isSubmitting}
        />

        <Pressable
          onPress={() => signIn.resetPasswordEmailCode.sendCode()}
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
      title="Reset your password"
      subtitle="We'll email you a code to reset it"
      footer={footer}
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

      {error && <Text className="text-destructive text-sm">{error}</Text>}

      <AuthButton
        label={isSubmitting ? "Sending…" : "Send reset code"}
        onPress={handleSendCode}
        disabled={!email || isSubmitting}
        loading={isSubmitting}
      />
    </AuthScaffold>
  );
}
