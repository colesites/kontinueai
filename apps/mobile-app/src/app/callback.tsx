import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useEffect } from "react";

import { LoadingScreen } from "@/components/loading-screen";

/** Safe, non-printing landing route for Clerk browser SSO deep links. */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      router.replace("/");
      return;
    }

    // Android delivers the link before startSSOFlow finishes exchanging and
    // activating its session. Keep this route mounted while Clerk completes.
    const timeout = setTimeout(() => {
      router.replace("/(auth)/sign-in");
    }, 8_000);
    return () => clearTimeout(timeout);
  }, [isLoaded, isSignedIn, router]);

  return <LoadingScreen />;
}
