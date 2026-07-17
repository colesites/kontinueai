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

## Android Google credentials

- Package name: `com.kontinueai.app`
- EAS signing SHA-1:
  `56:B9:A5:62:56:8C:68:00:76:43:6B:CF:56:86:E7:C0:F7:D9:FE:57`
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
