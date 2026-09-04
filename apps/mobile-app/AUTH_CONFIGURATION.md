# Kontinue Mobile authentication contract

Read this file before changing authentication or submitting a mobile build.

## Production Clerk instance

- The preview and production EAS profiles use the live Clerk instance for
  `clerk.chat.kontinueai.com`.
- Standalone Android browser SSO redirects to exactly
  `com.kontinueai.app://callback`.
- Android can also deliver the same standalone return through the app's
  primary scheme as `mobileapp://callback`; production Clerk and Expo Router
  must accept that exact URL without displaying its query parameters.
- That exact URL must exist in Clerk's **Native applications → Allowlist for
  mobile SSO redirect**. Similar-looking values are not equivalent.
- `mobileapp://sso-callback` remains allowlisted for the Expo development flow.
- The invalid legacy value `clerk://com.kontinueai.app.callback` must never be
  substituted for the standalone callback. It was removed from the production
  allowlist on 2026-07-16.

Before shipping an auth change, verify the production allowlist with Clerk's
`GET /v1/redirect_urls` Backend API or the dashboard. Clerk rejects custom
scheme callbacks character-for-character.

## Google sign-in flow selection

Browser SSO is the ONLY Google flow on every platform. The native Android
Credential Manager flow is gated off behind `NATIVE_GOOGLE_AUTH_ENABLED` in
`src/components/auth/use-google-oauth.ts`.

Native was disabled after build 10 (v1.2.2) failed with Clerk's
`The provided Google One Tap token is invalid`. Google issued a valid ID token;
Clerk rejected its audience. Re-enabling requires BOTH of the following to be
verified in the Clerk Dashboard, not assumed:

1. **Native Applications** must list package `com.kontinueai.app` with the build
   keystore's **SHA-256** fingerprint. This is a different value from the SHA-1
   below, which is what Google Cloud needs. Read it with
   `eas credentials --platform android` (Keystore -> the active build
   credentials).
2. **SSO Connections -> Google** must use **custom credentials** whose client ID
   is exactly the web client in `EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID`, plus
   that client's secret. Clerk validates the native ID token's audience against
   this connection, so shared/development credentials or any other web client
   reject every native token.

Whichever flow is active, only ONE account picker may appear per button press.
A failing native attempt must never fall back to browser SSO: that showed the
Credential Manager sheet followed by Google's web chooser for the same press.

## Android Google credentials

- Package name: `com.kontinueai.app`
- EAS signing SHA-1 (Google Cloud Android OAuth client):
  `56:B9:A5:62:56:8C:68:00:76:43:6B:CF:56:86:E7:C0:F7:D9:FE:57`
- EAS signing SHA-256 (Clerk Native Applications): NOT RECORDED. Capture it
  with `eas credentials --platform android` before re-enabling native Google.
- Google Android OAuth client:
  `309168072626-job6db4ids0fj0q8brklbql51tssp71r.apps.googleusercontent.com`
- Same-project Google Web OAuth client used as Credential Manager's server
  client ID:
  `309168072626-bebpj58g84cqsffa3f6e1j50spabumha.apps.googleusercontent.com`

The Android and Web OAuth clients must stay in the same Google Cloud project.
After an EAS keystore change, update the Android OAuth client with the new
SHA-1 before distributing the build.

## Password sign-in state machine

Email verification at sign-up and Client Trust at sign-in are separate:

- Sign-up verification proves that the user owns the email address.
- Clerk Client Trust can still return `needs_client_trust` for a correct
  password from a new device or fresh installation.
- User-enabled MFA returns `needs_second_factor`.

The custom sign-in screen must handle `complete`, `needs_client_trust`, and
`needs_second_factor`. It must send and verify Clerk's supported email/phone
code or accept TOTP/backup codes before calling `signIn.finalize()`.
Never collapse an incomplete Clerk status into a generic error message.
