# Web → mobile parity contract

Last audited: 2026-07-16 against `apps/web`.

The web app is the current product reference. A web feature is not complete
until its Expo implementation, shared backend calls, loading/empty/error
states, plan gates, and production authentication path have been considered.
This file is the regression checklist for future web changes.

## Route and feature map

| Web reference           | Expo route          | Native parity                                                                                                                                                                 |
| ----------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                     | `/`                 | New chat, model selection, agents, search, attachments, shared-link import, provider detection                                                                                |
| `/chat/[chatId]`        | `/chat/[id]`        | Streaming, persistence, retry/edit/copy/share, files and generated images, connector mentions, web search, voice dictation, clock and Gmail tool cards, import progress       |
| Kontinue Live sheet     | global modal (`/live` entry) | Transparent native sheet over the current screen; secured realtime gateway, native PCM capture/playback, transcripts, mute/interrupt/end, Convex allowance and metering                                      |
| `/agents`               | `/agents`           | Shared agent catalog, capabilities, suggested actions, agent-scoped chat                                                                                                      |
| `/canvas`               | `/canvas`           | Image/video modes, model/settings controls, reference image, credits, async jobs, gallery, publish/like/delete and lightbox                                                   |
| `/kode`                 | `/kode`             | Plan gate, credits, project list, build/plan creation and up to five text/code attachments                                                                                    |
| `/kode/[projectId]`     | `/kode/[id]`        | Conversation, live WebView preview, source tabs/edit/save, refinement attachments, rename/star/delete and HTML export                                                         |
| `/projects/[projectId]` | `/project/[id]`     | Project chats, status/counts, remove chats and delete project                                                                                                                 |
| `/tasks`                | `/tasks`            | List, board and calendar views; create/edit/delete; priority, due time, recurrence, reminders, agent tasks and push opt-in                                                    |
| `/settings`             | `/settings`         | Account, usage, memory, referral, data import history/detail, contact and sign-out                                                                                            |
| `/settings/connectors`  | `/connectors`       | Shared connector catalog and OAuth start/return flow, including Google Sheets                                                                                                 |
| `/feedback`             | `/feedback`         | Board, create, edit, vote, comment and status presentation                                                                                                                    |
| `/pricing`              | `/pricing`          | Shared plan definitions, billing intervals, limits and usage costs; secure checkout continues in the canonical hosted billing page                                            |
| `/share/[chatId]`       | `/share/[id]`       | Public read-only shared conversation and product CTA                                                                                                                          |
| settings legal pages    | `/legal/[document]` | Native shell around canonical public legal documents to prevent text drift                                                                                                    |
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
- Connector OAuth and Gmail sending use the shared `/api/connectors/*` routes.
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

## Current visual interaction contract

- The model selector is the native translation of
  `SharedModelSelectorContent`: centered glass modal, heading, search,
  horizontal provider chips, compact model rows, capabilities and plan gates.
  Kontinue models use the canonical web `/kontinueai-icon.png` asset.
- The chat composer mirrors `ChatInput`: one right-side action only. An empty
  composer shows Kontinue Live; typing or attaching content morphs that action
  into dictation plus submit/stop. Android and iOS must both resize the composer
  above the keyboard.
- Kontinue Live is never presented as a standalone product page. `/live` is
  only the Expo Router entry for a transparent modal sheet over the current
  screen.
- Product routes use opaque theme backgrounds and no stack push animation, so
  Android never composites the outgoing and incoming screens together.
- Imperative React Native colors (spinners, placeholders, shadows, likes,
  stars) must come from `useTheme()`. Fixed magenta is valid only as the
  selectable Default theme swatch, never as an active-control shortcut.
- Theme and appearance selections persist in SecureStore. Sidebar search,
  New chat, product menu, settings, feedback, agents, connectors and Canvas
  follow their corresponding `apps/web` surface hierarchy and tokens.
