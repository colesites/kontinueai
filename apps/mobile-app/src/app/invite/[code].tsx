import { useEffect } from "react";
import { View } from "react-native";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@clerk/expo";

import { LoadingScreen } from "@/components/loading-screen";
import { savePendingReferralCode } from "@/lib/referral";

/**
 * `mobileapp://invite/<code>` — the native twin of web's /invite/[code]: keeps
 * the code for the first account sync, then continues to sign-up (or home
 * when already signed in, where attribution no longer applies).
 */
export default function InviteScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    let active = true;
    void savePendingReferralCode(code ?? "").finally(() => {
      if (!active) return;
      router.replace((isSignedIn ? "/" : "/sign-up") as Href);
    });
    return () => {
      active = false;
    };
  }, [code, isLoaded, isSignedIn, router]);

  return (
    <View style={{ flex: 1 }}>
      <LoadingScreen />
    </View>
  );
}
