import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { useSignIn, useSSO } from "@clerk/clerk-expo";
import * as Linking from "expo-linking";
import { Lock, Mail } from "lucide-react-native";

import { Text } from "@/components/ui/text";
import { KontinueLogo } from "@/components/ui/kontinue-logo";
import { GoogleButton } from "@/components/auth/google-button";
import { AuthField } from "@/components/auth/auth-field";

export default function SignInScreen() {
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();
  const { startSSOFlow } = useSSO();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onEmailSignIn = async () => {
    if (!isLoaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      const attempt = await signIn.create({
        identifier: email.trim(),
        password,
      });
      if (attempt.status === "complete") {
        await setActive({ session: attempt.createdSessionId });
        router.replace("/");
      } else {
        setError("Additional verification required.");
      }
    } catch (e: any) {
      setError(
        e?.errors?.[0]?.message ?? "Could not sign in. Check your details.",
      );
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { createdSessionId, setActive: ssoSetActive } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: Linking.createURL("/", { scheme: "mobileapp" }),
      });
      if (createdSessionId && ssoSetActive) {
        await ssoSetActive({ session: createdSessionId });
        router.replace("/");
      }
    } catch (e: any) {
      setError(e?.errors?.[0]?.message ?? "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView
      className="bg-background"
      style={{ flex: 1 }}
      edges={["top", "bottom"]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View className="flex-1 justify-center px-6" style={{ flex: 1 }}>
          <View className="items-center">
            <KontinueLogo height={34} />
          </View>
          <Text className="mt-7 text-center text-[24px] font-semibold tracking-tight text-foreground">
            Welcome back
          </Text>
          <Text className="mt-1.5 text-center text-[14px] text-muted-foreground">
            Sign in to continue to Kontinue AI.
          </Text>

          <View className="mt-8 gap-3">
            <AuthField
              icon={Mail}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <AuthField
              icon={Lock}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            {error ? (
              <Text className="text-[12.5px] text-destructive">{error}</Text>
            ) : null}

            <Pressable
              onPress={onEmailSignIn}
              disabled={busy}
              className="mt-1 h-12 flex-row items-center justify-center rounded-xl bg-primary active:opacity-90"
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-[15px] font-semibold text-primary-foreground">
                  Sign in
                </Text>
              )}
            </Pressable>
          </View>

          {/* Divider */}
          <View className="my-6 flex-row items-center gap-3">
            <View className="h-px flex-1 bg-border" />
            <Text className="text-[12px] text-muted-foreground">or</Text>
            <View className="h-px flex-1 bg-border" />
          </View>

          <GoogleButton
            label="Continue with Google"
            onPress={onGoogle}
            disabled={busy}
          />

          <View className="mt-8 flex-row justify-center gap-1.5">
            <Text className="text-[13.5px] text-muted-foreground">
              New to Kontinue AI?
            </Text>
            <Link href="/sign-up" replace>
              <Text className="text-[13.5px] font-semibold text-primary">
                Create an account
              </Text>
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
