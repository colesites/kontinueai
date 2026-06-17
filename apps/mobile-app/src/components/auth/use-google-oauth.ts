import { useEffect, useState, useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useSSO } from "@clerk/expo";

// Required so the auth session popup can dismiss itself and hand the result
// back to the app. Safe to call at module load; idempotent.
WebBrowser.maybeCompleteAuthSession();

/**
 * Browser-based Google sign-in via Clerk SSO. Works in Expo Go (no native
 * module / dev build required) — the OAuth handshake happens in a system
 * browser sheet and returns to the app through the `mobileapp://` scheme.
 */
export function useGoogleOAuth() {
  const { startSSOFlow } = useSSO();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Warm up / cool down the Android browser for a snappier first open.
  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
        // Matches the redirect registered in the Clerk Dashboard
        // (standalone build -> mobileapp://sso-callback; Expo Go ->
        // exp://.../--/sso-callback, which Clerk dev instances accept).
        redirectUrl: Linking.createURL("sso-callback"),
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        return true;
      }
      // No session means the user dismissed the sheet or extra steps are
      // required (e.g. MFA) — surface nothing rather than a scary error.
      return false;
    } catch (err) {
      console.error("[google-oauth]", JSON.stringify(err, null, 2));
      setError("Could not sign in with Google. Please try again.");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [startSSOFlow]);

  return { signInWithGoogle, isLoading, error };
}
