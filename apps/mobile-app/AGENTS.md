# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Build versioning is mandatory

Before creating any local or EAS build, read `BUILD_VERSIONING.md` completely
and follow its checklist. Never submit a build without confirming the app
version and build number policy in the handoff.

## Authentication configuration is mandatory

Before changing Clerk, Google sign-in, app schemes, Android credentials, or
submitting an auth-related build, read `AUTH_CONFIGURATION.md` completely.
Verify production redirect URLs and signing fingerprints instead of assuming a
similar-looking callback or OAuth client is interchangeable.

## Web parity is mandatory

Before changing product UI or functionality, read `WEB_PARITY.md` and compare
the relevant implementation in `apps/web`. Update the parity document whenever
the reference web surface changes or a mobile adaptation is added.
