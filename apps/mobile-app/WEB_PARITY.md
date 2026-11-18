# Web → mobile parity contract

Last audited: 2026-11-18 against `apps/web`.

The web app is the current product reference. A web feature is not complete
until its Expo implementation, shared backend calls, loading/empty/error
states, plan gates, and production authentication path have been considered.
This file is the regression checklist for future web changes.

## Route and feature map

| Web reference           | Expo route          | Native parity                                                                                                                                                                 |
| ----------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                     | `/`                 | New chat (provider from the model, like web), model selection, agents, search, attachments, voice dictation, shared-link import with failure toasts, provider detection |
| `/chat/[chatId]`        | `/chat/[id]`        | Streaming, persistence (image-only and search-only turns included), Thinking toggle + accordion, retry / switch model on retry / edit / copy / speak, image lightbox with save, run_code file cards, citation links, image aspect/size options, prompt navigator + jump to latest, structured error card, memory-limit toast, connector mentions, web search, voice dictation, clock and Gmail tool cards, import progress |
| Kontinue Live sheet     | global modal (`/live` entry) | Transparent native sheet over the current screen; secured realtime gateway, native PCM capture/playback, transcripts, mute/interrupt/end, Convex allowance and metering                                      |
| `/agents`               | `/agents`           | Shared agent catalog, capabilities, suggested actions, agent-scoped chat                                                                                                      |
| `/canvas`               | `/canvas`           | Pro/Max gate via `canAccessPlanFeature` (K-Image free for all), video also on referral-bonus credits, credits charged server-side only, uploaded multi-reference images (plan x model cap), model-aware ratios/durations/resolutions, async jobs, gallery, lightbox with creator, metadata, save, share, publish/delete |
| `/kode`                 | `/kode`             | Coming-soon screen (asks `/api/kode/availability`), Pro gate via `canAccessPlanFeature`, starters, credits, project cards, build/plan creation and up to five text/code attachments |
| `/kode/[projectId]`     | `/kode/[id]`        | Same gates, conversation, live WebView preview, source tabs/edit/save, refinement attachments, rename/star/delete and HTML export |
| `/projects/[projectId]` | `/project/[id]`     | Project chats, status/counts, remove chats and delete project                                                                                                                 |
| `/tasks`                | `/tasks`            | List, board (with delete) and month-grid calendar; create/edit/delete; priority, due time, recurrence incl. Yearly, web reminder presets + custom time, agent tasks and push opt-in |
| `/settings`             | `/settings`         | `?tab=` deep links, account, web usage breakdown (external/basic/pro/frontier), memory, invite (code auto-created), data import history/detail, contact and sign-out |
| `/settings/connectors`  | `/connectors`       | Shared connector catalog; OAuth runs in the in-app browser after a one-time ticket handoff (`/api/connectors/mobile-handoff` → `/connect/mobile`), so no prior browser session is needed |
| `/feedback`             | `/feedback`         | Board, create, edit, vote, threaded replies (`parentId`, 3 levels like web) |
| `/pricing`              | `/pricing`          | Personal/Professional filter, billing period, plan cards, credit rates (incl. K-Video and Live), full comparison from `@repo/core/pricing-comparison`; checkout continues on the hosted page with `?plan=&period=` |
| `/share/[chatId]`       | `/share/[id]`       | Public read-only shared conversation and product CTA                                                                                                                          |
| settings legal pages    | `/legal/[document]` | Native shell around canonical public legal documents to prevent text drift                                                                                                    |
| `/invite/[code]`        | `/invite/[code]`    | Deep link stores the referral code; sign-up also takes an optional invite code; sent once with the first user sync |
| Clerk sign-in/sign-up   | `/(auth)/*`         | Email/password, sign-up verification/resend, Client Trust and MFA sign-in steps, reset, native Google plus browser fallback, accessible fields and secure password visibility |

`/notifications` is mobile-specific and provides an in-app notification center.

## Marketing-site relationship

`apps/marketing` is the canonical public content, SEO, download, security,
product-education, blog, and company-information surface. It intentionally uses
its own warm monochrome/violet marketing design system; the signed-in product
in `apps/web` uses the shared magenta, dark/light, and selectable-theme tokens
that this native app mirrors.

Do not duplicate SEO landing pages or the journal inside Expo. Native must keep
product facts and entry points consistent by linking to the canonical marketing
or hosted app pages for public legal, billing, security, and long-form content.
User workflows (chat, imports, Live, Canvas, Kode, tasks, projects, connectors,
feedback, settings, and notifications) remain native and must follow the web app
contract above.

## Shared client code

Logic both clients run lives in `@repo/core`; web's feature files re-export it,
so changing one changes both:

- `chat-request`: `/api/chat` body, retry trimming, chat error copy + kind.
- `chat-message-parts`, `chat-search-results`: tool output, thinking, files,
  images and search citations read from AI SDK parts.
- `chat-image-options`, `chat-mentions`, `import-strategy`,
  `app-error-client` (AppError / readApiError),
  `kode-availability`, `pricing-comparison`, `plan-access`, `plan-config`.

Mobile-only mirrors with parity tests: `src/lib/import-providers.ts`
(`@repo/utils` can't resolve under Metro; `import-providers.test.ts` fails on
drift).

## Shared backend contract

- Convex is shared directly through `@repo/convex`; mobile must not create a
  parallel data model or duplicate authorization rules.
- Next.js server routes are shared through `EXPO_PUBLIC_API_URL`. Every private
  mobile request must include the current Clerk Bearer token.
- AI chat uses the same `/api/chat` route and request body as web.
- Canvas uses `/api/canvas/generate-image`, `/api/canvas/generate-video`, and
  the shared Convex video job records.
- Kode uses `/api/kode/build` and the shared `kodeWeb` Convex APIs.
- Live voice uses `/api/realtime/token` plus `realtimeVoice` Convex metering.
- Connector OAuth and Gmail sending use the shared `/api/connectors/*` routes;
  mobile starts OAuth through `/api/connectors/mobile-handoff`.
- Kode availability: `/api/kode/availability` (falls back to web's host rule).
- Generated files use `/api/files/upload` plus Convex file records.
- Legal and billing pages may remain canonical hosted surfaces when duplicating
  them would create security, compliance, or content-drift risk.

## Required audit when web changes

1. Compare new/changed web pages under `apps/web/src/app` and feature code under
   `apps/web/src/features` with the table above.
2. Reuse core constants and Convex APIs before copying logic.
3. Implement the native interaction pattern, including 44-point targets,
   keyboard/safe-area handling, accessibility labels and all async states.
4. Exercise free and paid plan gates, fresh and restored authentication, and
   a release-mode Android bundle.
5. Update this file and `BUILD_VERSIONING.md` before the next distributable
   build.

## Mobile adaptations

- Code blocks: web's always-dark GitHub panel plus syntax colors from a small
  built-in highlighter (`src/lib/code-highlight.ts`, GitHub Dark palette).
  Web loads no highlight.js theme, so its tokens are currently uncolored.
- `@` mentions: typing `@` lists connected connectors above the composer
  (`detectMention` / `applyMention` in `@repo/core/chat-mentions`).
- Shared-link import follows `getImportStrategy` (`@repo/core/import-strategy`,
  re-exported by `@repo/utils`): Firecrawl action, or `/api/import/scrape` +
  `appendImportedMessagesToChat` when the scraper kill-switch is on.
- Offline: a pill appears when the Convex socket stays down for 2.5s while the
  app is active, and a "Back online" toast follows.
- Image aspect/size options exist on the home composer and in a chat; home
  choices travel in the pending draft to the first send.

## Checks

`.github/workflows/mobile-checks.yml` runs core tests, theme-token sync,
typecheck, lint and Jest on PRs touching the app or shared packages. Before a
distributable build also run the release bundle locally:
`bunx expo export:embed --eager --platform android --dev false --bundle-output /tmp/x.bundle --assets-dest /tmp`.

## Current visual interaction contract

- The model selector is the native translation of
  `SharedModelSelectorContent`: centered glass modal, heading, search,
  horizontal provider chips, compact model rows, capabilities and plan gates.
  Kontinue models use the canonical web `/kontinueai-icon.png` asset.
- The chat composer mirrors `ChatInput`: one right-side action only. An empty
  composer shows Kontinue Live; typing or attaching content morphs that action
  into dictation plus submit/stop. Android and iOS must both resize the composer
  above the keyboard.
- Chat, Home and Canvas float their header pills and composer / input bar over
  the content (web AppShell): content scrolls beneath them behind a soft
  background fade, and they sit on the keyboard when it opens.
- Native modules that may be missing from a build (`expo-speech`,
  `expo-speech-recognition`) are probed with `requireOptionalNativeModule`
  before they are loaded; the feature hides or explains itself instead of
  crashing.
- Kontinue Live is never presented as a standalone product page. `/live` is
  only the Expo Router entry for a transparent modal sheet over the current
  screen.
- Product routes use opaque theme backgrounds and no stack push animation, so
  Android never composites the outgoing and incoming screens together.
- Imperative React Native colors (spinners, placeholders, shadows, likes,
  stars) must come from `useTheme()`. No color may be hand-written in this app.
  Allowed literals: provider brand colors, project color swatches (user data,
  same as web), the black media scrims/white controls in the image and canvas
  lightboxes, and the crash screen, which reads `THEME_TOKENS` directly
  because it renders above ThemeProvider. Task priorities use web's exact
  Tailwind classes (`text-red-500` etc.).
- Errors and confirmations: failures show a toast (`src/components/ui/toast`,
  `showAppErrorToast` adds web's "Upgrade to …" action). `Alert.alert` is only
  for destructive confirmations.
- KNOWN GAP: dropdowns and menus have NO real backdrop blur on Android, so they
  are flat translucent panels rather than the web's liquid glass. Since Expo
  SDK 56 a `BlurView` only blurs when given a `blurTarget` ref pointing at a
  native `BlurTargetView` wrapping the content to blur. Mounting that wrapper
  at the app root shipped in build 11 (v1.2.3) and the app crashed on launch;
  `ExpoBlurTargetView` proxies addView/removeView/getChildCount to an inner
  view, which its own source notes breaks react-native-gesture-handler's
  attached-view walk. Reverted in v1.2.4. Do NOT re-attempt this without a
  captured crash log (`adb logcat`) and a scope narrower than the whole tree.
- Design tokens are GENERATED from `packages/tailwind-config/shared-styles.css`
  into `src/theme/tokens.generated.{css,ts}` by `bun run theme:sync`. The web
  stylesheet is the only place a Kontinue color is authored; the generated
  files are never edited by hand. Values are converted to hex for the TS
  artifact because React Native cannot parse `oklch()` at runtime.
- Theme ids and order match `apps/web/src/lib/theme.ts` exactly
  (`normal, pink, emerald, chelsea, amethyst`), because the id is persisted.
  `normal` is the default. This app's retired `default` id migrates to `pink`
  via `normalizeTheme`, mirroring web's own `getSavedTheme` migration.
  Provider brand colors (model vendors, the Google button) and translucent
  glass overlays are not theme tokens and stay as literals.
- Theme and appearance selections persist in SecureStore. Sidebar search,
  New chat, product menu, settings, feedback, agents, connectors and Canvas
  follow their corresponding `apps/web` surface hierarchy and tokens.
