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
 * Uses Clerk's native Credential Manager flow in standalone Android builds.
 * Expo Go and iOS keep the browser SSO fallback until their native Google
 * credentials are configured. Native Android avoids fragile custom-scheme
 * callbacks and gives us the real provider error code when configuration is
 * wrong instead of collapsing every failure into the same generic message.
 */
export function useGoogleOAuth() {
  const { startSSOFlow } = useSSO();
  const { startGoogleAuthenticationFlow } = useSignInWithGoogle();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const useNativeAndroid =
    Platform.OS === "android" && Constants.appOwnership !== "expo";
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

      let nativeResult: Awaited<
        ReturnType<typeof startGoogleAuthenticationFlow>
      >;

      try {
        // Only provider-launch failures are eligible for browser recovery.
        // Activation happens outside this catch because Clerk can already have
        // created the native session before a later callback/navigation error.
        nativeResult = await startGoogleAuthenticationFlow();
      } catch (nativeError) {
        const nativeDetails = getGoogleAuthError(nativeError);

        Sentry.captureException(nativeError, {
          tags: {
            subsystem: "google-auth",
            flow: "native-android",
            errorCode: nativeDetails.code,
            fallback: "browser-sso",
          },
          extra: { providerMessage: nativeDetails.message },
        });

        // A cancelled native picker should stay cancelled. For provider or
        // Credential Manager failures, use Clerk's browser flow as a reliable
        // recovery path instead of leaving the user locked out.
        if (nativeDetails.cancelled) return false;

        return await activateSession(
          await startSSOFlow({
            strategy: "oauth_google",
            redirectUrl: browserRedirectUrl,
          }),
        );
      }

      // A returned native result must never launch a second OAuth flow.
      return await activateSession(nativeResult);
    } catch (err) {
      const details = getGoogleAuthError(err);
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
