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
   Then run `bun install` from the REPO ROOT and keep the updated `bun.lock`.
   The lockfile records this workspace's `version`, and EAS installs with
   `bun install --frozen-lockfile`, so a version bump without a refreshed
   lockfile fails the build in "Install dependencies" with
   `lockfile had changes, but lockfile is frozen`. Verify with
   `bun install --frozen-lockfile` locally before submitting.
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

- User-visible version: `1.4.0`
- Scope: Kode remote control (minor). Kode in the app is now remote control
  for the Kode desktop app: your computers with online state, their projects
  and threads, new threads, a live thread view with streamed replies, Allow /
  Deny and question cards, Stop, follow-ups and push deep links
  (`/kode/[deviceId]/[chatId]`). Needs the `kodeRemote` Convex functions on
  the production deployment. The old Kode web-app builder screens are
  removed, and the pricing and settings text no longer mention it.
- Previous recorded Android remote build number before this release: `17`.
- Profile: `production`.
- Submitted Android production build number: `18` (EAS auto-increment).
- EAS build ID: `9100cdc4-a56f-4084-87a5-8d772f404602` (submitted with
  `--no-wait`; do not poll it from an AI task).

### Previous releases

- User-visible version: `1.3.3`
- Scope: fixes on top of 1.3.2. Home logo no longer sits in a solid box on
  Android (boxShadow can only draw the view's box; the logo glow is iOS-only
  again). Composers sit closer to the bottom (`composerBottomInset`). Settings
  and Connectors headers float as glass pills over the page; the profile
  card's glow fades instead of ending in a hard line. The drawer ignores
  backdrop taps for 400ms after opening (double taps closed it at once). The
  composer's "+" and image-size menus render through an in-window Portal
  instead of a Modal, so the keyboard stays open.
- Previous recorded Android remote build number before this release: `16`.
- Profile: `production`.
- Submitted Android production build number: `17` (EAS auto-increment).
- EAS build ID: `87490213-e78e-413f-b7fe-4a6af710f7d2` (submitted with
  `--no-wait`; do not poll it from an AI task).

### Previous releases

- User-visible version: `1.3.2`
- Scope: fixes the stray rectangle drawn inside glass surfaces on Android
  (chat composer, header pills, Canvas pill, empty state, Canvas input bar,
  menus, toasts). Shadow wrappers used Android `elevation`, which casts from
  the wrapper's rectangular outline and showed through the translucent glass.
  All of them now go through `softShadow()` (src/lib/shadow.ts): iOS keeps
  the shadow* props, Android draws a `boxShadow` that follows the radius and
  stays outside the view.
- Previous recorded Android remote build number before this release: `15`.
- Profile: `production`.
- Submitted Android production build number: `16` (EAS auto-increment).
- EAS build ID: `04b2ef23-802e-4c8d-80df-7dfd7a4a62cc` (submitted with
  `--no-wait`; do not poll it from an AI task).

### Previous releases

- User-visible version: `1.3.1`
- Scope: web-parity polish on top of 1.3.0. Composer matches web (52px
  input, 32px tools, divider + inline image size select, gradient glow
  send/Live button) with a true conic "live wire" border; Canvas header and
  input bar, Agents and Tasks rebuilt to the web layouts; header pills use
  web's glass recipe; Import button and How-it-works badges fixed; dialogs and
  menus get web's blur on iOS (near-opaque glass on Android, see
  WEB_PARITY.md); the drawer stays mounted (no reload on every open), its
  search field no longer drops focus, and the account menu opens above the
  footer.
- Previous recorded Android remote build number before this release: `14`.
- Submitted Android preview build number: `15` (EAS auto-increment).
- EAS build ID: `c64f42e9-5b51-42a2-aedc-1821221c6ba2` (commit 5744bc8,
  submitted with `--no-wait`; do not poll it from an AI task).

### Previous releases

- User-visible version: `1.3.0`
- Scope: web-parity release. Chat gains thinking, retry with another model,
  read-aloud, image viewer, generated-file cards, code highlighting, `@`
  mentions, image options and a floating header/composer; Canvas, Kode,
  Feedback, Settings, Pricing, Tasks and Connectors follow web's rules and
  layouts; toasts replace error alerts; offline banner; referral invite codes.
  Fixes Canvas double-charging video credits, Canvas reference images, the
  connector OAuth sign-in handoff, "Back to chat" and the new-chat button.
- New native module: `expo-speech` (read-aloud). Speech features are probed
  with `requireOptionalNativeModule`, so builds without them don't crash.
- Previous recorded Android remote build number before this release: `12`.
- Android preview build `13` (commit 2d5dcc7) ERRORED at install: EAS used
  bun 1.3.13 against a 1.4.4 lockfile. Fixed in 65c559d (bun pinned to 1.4.4).
- Android preview build `14` finished: EAS build ID
  `036b6694-0e1d-4069-88c2-3ae534c9ddad` (commit 65c559d).

### Previous releases

- User-visible version: `1.2.4`
- Scope: reverts the root `BlurTargetProvider` added in 1.2.3, which wrapped
  the whole app in expo-blur's native `BlurTargetView` and crashed the app on
  launch. Everything else from 1.2.3 is retained.
- Previous recorded Android remote build number before this release: `11`.
- Submitted Android preview build number: `12`.
- EAS build ID: `8b6c83ef-7506-4ef9-9d8b-0d0459253676` (submitted with
  `--no-wait`; do not poll it from an AI task).

### Previous releases

- User-visible version: `1.2.3`
- **CRASHED ON LAUNCH.** Do not distribute build 11.
- Scope: web-parity UI corrections (chat input height, model trigger height,
  centred composer bloom, import-button ring, link underline, toolbar glass
  rim, send-button rim) plus real Android backdrop blur and a corrected
  Android adaptive icon. Google sign-in now uses browser SSO on all platforms;
  the native Credential Manager flow is gated off pending Clerk configuration.
- Previous recorded Android remote build number before this release: `10`.
- Submitted Android preview build number: `11`.
- EAS build ID: `d0750c7a-56d1-4a37-b20d-8a512c5fddfc` (submitted with
  `--no-wait`; do not poll it from an AI task).

### Previous releases

- User-visible version: `1.2.2`
- Scope: mobile design tokens are now generated from the web source of truth
  (`packages/tailwind-config/shared-styles.css`) instead of hand-copied, and
  the default theme changed from the retired `default` id to `normal`.
  Carries the 1.2.1 Google account picker fix, which never produced a
  usable artifact.
- Previous recorded Android remote build number before this release: `9`.
- Submitted Android preview build number: `10`.
- EAS build ID: `76e80192-db92-43a3-9e6b-65c55fde7b25` (submitted with
  `--no-wait`; do not poll it from an AI task).

### Previous releases

- User-visible version: `1.2.1`
- Scope: removes the duplicate Google account picker on standalone Android.
  The native Credential Manager flow no longer chains into browser SSO on a
  non-cancellation error, so exactly one picker is shown per press.
- Submitted Android preview build number: `9`.
- EAS build ID: `065d5b01-6724-414c-b562-40b3b6503b96`.
- **FAILED** in "Install dependencies": the version bump was not accompanied
  by a refreshed `bun.lock`, so `bun install --frozen-lockfile` rejected it.
  versionCode 9 is burned and must never be reused. Superseded by 1.2.2.

- User-visible version: `1.2.0`
- Scope: web-parity UI/UX release plus Android production authentication and
  callback reliability fixes.
- Submitted Android preview build number: `8`.
- EAS build ID: `24f76033-2f09-45b9-b5e8-2ac36fc7142c`.
