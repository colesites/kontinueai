import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { useSignUp, useSSO } from "@clerk/clerk-expo";
import * as Linking from "expo-linking";
import { KeyRound, Lock, Mail, User } from "lucide-react-native";

import { Text } from "@/components/ui/text";
import { KontinueLogo } from "@/components/ui/kontinue-logo";
import { GoogleButton } from "@/components/auth/google-button";
import { AuthField } from "@/components/auth/auth-field";

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp, setActive, isLoaded } = useSignUp();
  const { startSSOFlow } = useSSO();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCreate = async () => {
    if (!isLoaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      const trimmedName = fullName.trim().replace(/\s+/g, " ");
      const [firstName, ...rest] = trimmedName.split(" ");
      const lastName = rest.join(" ");
      await signUp.create({
        emailAddress: email.trim(),
        password,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (e: any) {
      setError(e?.errors?.[0]?.message ?? "Could not create your account.");
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    if (!isLoaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (attempt.status === "complete") {
        await setActive({ session: attempt.createdSessionId });
        router.replace("/");
      } else {
        setError("Invalid code. Try again.");
      }
    } catch (e: any) {
      setError(e?.errors?.[0]?.message ?? "Verification failed.");
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
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View className="flex-1 justify-center px-6" style={{ flex: 1 }}>
          <View className="items-center">
            <KontinueLogo height={34} />
          </View>

          {pendingVerification ? (
            <>
              <Text className="mt-7 text-center text-[24px] font-semibold tracking-tight text-foreground">
                Verify your email
              </Text>
              <Text className="mt-1.5 text-center text-[14px] text-muted-foreground">
                Enter the code we sent to {email}.
              </Text>
              <View className="mt-8 gap-3">
                <AuthField
                  icon={KeyRound}
                  placeholder="Verification code"
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                />
                {error ? <Text className="text-[12.5px] text-destructive">{error}</Text> : null}
                <Pressable
                  onPress={onVerify}
                  disabled={busy}
                  className="mt-1 h-12 items-center justify-center rounded-xl bg-primary active:opacity-90"
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-[15px] font-semibold text-primary-foreground">Verify & continue</Text>
                  )}
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text className="mt-7 text-center text-[24px] font-semibold tracking-tight text-foreground">
                Create your account
              </Text>
              <Text className="mt-1.5 text-center text-[14px] text-muted-foreground">
                Start planning, designing and coding with Kontinue.
              </Text>

              <View className="mt-8 gap-3">
                <AuthField
                  icon={User}
                  placeholder="Full name"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  autoComplete="name"
                />
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
                {error ? <Text className="text-[12.5px] text-destructive">{error}</Text> : null}
                <Pressable
                  onPress={onCreate}
                  disabled={busy}
                  className="mt-1 h-12 items-center justify-center rounded-xl bg-primary active:opacity-90"
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-[15px] font-semibold text-primary-foreground">Sign up</Text>
                  )}
                </Pressable>
              </View>

              <View className="my-6 flex-row items-center gap-3">
                <View className="h-px flex-1 bg-border" />
                <Text className="text-[12px] text-muted-foreground">or</Text>
                <View className="h-px flex-1 bg-border" />
              </View>

              <GoogleButton label="Continue with Google" onPress={onGoogle} disabled={busy} />

              <View className="mt-8 flex-row justify-center gap-1.5">
                <Text className="text-[13.5px] text-muted-foreground">Already have an account?</Text>
                <Link href="/sign-in" replace>
                  <Text className="text-[13.5px] font-semibold text-primary">Sign in</Text>
                </Link>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
