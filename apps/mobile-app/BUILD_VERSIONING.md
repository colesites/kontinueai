# Kontinue Mobile build versioning

This file is mandatory reading for any AI or developer before building the
mobile app.

## Source of truth

- `app.json > expo.version` is the user-visible release version.
- `package.json > version` must always match `expo.version`.
- EAS is the source of truth for Android `versionCode` and iOS `buildNumber`.
- `eas.json` must keep `cli.appVersionSource` set to `remote` and
  `autoIncrement: true` on every build profile. EAS increments the developer
  build number for every submitted build, including preview builds.

Do not add a fixed `android.versionCode` or `ios.buildNumber` to `app.json`
while remote versioning is enabled. A local number there is ignored by EAS and
creates a misleading second source of truth.

## Required pre-build checklist

1. Read this file and the exact Expo SDK instructions in `AGENTS.md`.
2. Confirm that `app.json` and `package.json` have the same SemVer value.
3. Choose the user-visible version change:
   - patch for fixes and polish;
   - minor for backward-compatible features or a major mobile parity release;
   - major for an incompatible product change.
4. Update both files together when the build is a new user-facing release.
   Internal rebuilds of the same release keep the SemVer value; EAS still
   creates a unique build number automatically.
5. Run `bun run typecheck`, `bun run lint`, and `bun run test` from this app.
6. Run `eas build:version:get -p android --profile <profile>` (and iOS when
   applicable) before submitting so the previous remote number is recorded.
7. Run the requested EAS build. Do not disable auto-increment.
8. In the handoff, report the SemVer, EAS profile, platform, EAS build URL/ID,
   and resulting store build number.

## After every build

Verify the EAS build details show a build number greater than the previous one.
If EAS did not increment it, stop distribution and repair the version source
before rebuilding. Never distribute two artifacts with the same platform build
number.

## Current release

- User-visible version: `1.2.0`
- Scope: web-parity UI/UX release plus Android production authentication and
  callback reliability fixes.
- Previous recorded Android remote build number before this release: `7`.
- Submitted Android preview build number: `8`.
- EAS build ID: `24f76033-2f09-45b9-b5e8-2ac36fc7142c` (submitted with
  `--no-wait`; do not poll it from an AI task).
