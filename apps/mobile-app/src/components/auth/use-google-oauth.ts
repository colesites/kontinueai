import { useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import { useSSO } from "@clerk/expo";
import { useSignInWithGoogle } from "@clerk/expo/google";
import * as Sentry from "@sentry/react-native";

import { getGoogleAuthError } from "@/components/auth/google-auth-error";

// Required so the auth session popup can dismiss itself and hand the result
// back to the app. Safe to call at module load; idempotent.
WebBrowser.maybeCompleteAuthSession();

const NATIVE_AUTH_SCHEME = "com.kontinueai.app";

/**
 * Gates Clerk's native Credential Manager flow on Android.
 *
 * Currently OFF. The native flow returns a genuine Google ID token, but Clerk
 * rejected it with "The provided Google One Tap token is invalid" because it
 * validates the token's audience against its own Google connection. Turning
 * this back on requires BOTH, verified in the Clerk Dashboard:
 *
 *   1. Native Applications: the Android package name `com.kontinueai.app` with
 *      the build keystore's SHA-256 fingerprint. This is separate from the
 *      SHA-1 that Google Cloud needs; see AUTH_CONFIGURATION.md.
 *   2. SSO Connections -> Google: custom credentials whose client ID is the
 *      SAME web client as EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID, plus its
 *      secret. Shared/dev credentials or any other web client make every
 *      native token fail audience validation.
 *
 * Flip to `true` only after a standalone build completes Google sign-up end to
 * end. Browser SSO stays the fallback-free path until then.
 */
const NATIVE_GOOGLE_AUTH_ENABLED = false;

/**
 * Google sign-in for every platform.
 *
 * Browser SSO is the single flow: it works on iOS, Android and Expo Go, and
 * needs only the redirect allowlist that AUTH_CONFIGURATION.md pins down.
 *
 * Exactly one account picker may ever be shown per press. The native path must
 * never chain into browser SSO on failure: that showed the Credential Manager
 * sheet and then Google's web "Choose an account" page for the same attempt.
 */
export function useGoogleOAuth() {
  const { startSSOFlow } = useSSO();
  const { startGoogleAuthenticationFlow } = useSignInWithGoogle();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const useNativeAndroid =
    NATIVE_GOOGLE_AUTH_ENABLED &&
    Platform.OS === "android" &&
    Constants.appOwnership !== "expo";
  const browserRedirectUrl =
    Constants.appOwnership === "expo"
      ? AuthSession.makeRedirectUri({ path: "sso-callback" })
      : AuthSession.makeRedirectUri({
          scheme: NATIVE_AUTH_SCHEME,
          path: "callback",
        });

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

    const activateSession = async (
      result:
        | Awaited<ReturnType<typeof startSSOFlow>>
        | Awaited<ReturnType<typeof startGoogleAuthenticationFlow>>,
    ) => {
      const { createdSessionId, setActive } = result;

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        return true;
      }

      // No session means the user dismissed the sheet or extra steps are
      // required (for example MFA). Clerk will resume that state later.
      return false;
    };

    try {
      if (!useNativeAndroid) {
        return await activateSession(
          await startSSOFlow({
            strategy: "oauth_google",
            redirectUrl: browserRedirectUrl,
          }),
        );
      }

      // The native Credential Manager sheet is the only picker on Android.
      // A failure here surfaces as an error; it must not start browser SSO,
      // which would present a second "Choose an account" screen.
      return await activateSession(await startGoogleAuthenticationFlow());
    } catch (err) {
      const details = getGoogleAuthError(err);

      // Dismissing the picker is a normal outcome, not a failure to report.
      if (details.cancelled) return false;

      console.error("[google-auth]", details.code, details.message);
      Sentry.captureException(err, {
        tags: {
          subsystem: "google-auth",
          flow: useNativeAndroid ? "native-android" : "browser-sso",
          errorCode: details.code,
        },
        extra: { providerMessage: details.message },
      });
      setError(details.userMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [
    browserRedirectUrl,
    startGoogleAuthenticationFlow,
    startSSOFlow,
    useNativeAndroid,
  ]);

  return { signInWithGoogle, isLoading, error };
}
